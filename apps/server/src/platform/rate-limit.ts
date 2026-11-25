import { sql } from "drizzle-orm";

import { rateLimitBuckets } from "../db/schema.ts";
import type { RequestContext } from "./context.ts";

/** 절차마다, IP마다 고정 창 안에서 받는 요청 수(RATE 규칙 1). */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  signup: { limit: 10, windowMs: 60 * 60_000 },
  refresh: { limit: 30, windowMs: 60_000 },
} as const;

export type RateLimitedProcedure = keyof typeof RATE_LIMITS;

/**
 * 이 요청을 센다. 한도 안이면 null, 넘었으면 창이 끝날 때까지 남은 초를 돌려주고 `Retry-After`
 * 헤더를 단다. 증가와 판정을 UPSERT 한 문으로 하므로, 같은 키의 동시 요청은 행 잠금으로 줄을 서고
 * 한도보다 많이 통과하지 못한다(RATE 규칙 3). 창은 서버 시계를 따른다(RATE 규칙 4).
 */
export async function checkRateLimit(
  context: RequestContext,
  procedure: RateLimitedProcedure,
): Promise<number | null> {
  const { limit, windowMs } = RATE_LIMITS[procedure];
  const now = context.now();
  const expiredBefore = new Date(now.getTime() - windowMs);
  const expired = sql`${rateLimitBuckets.windowStartedAt} <= ${expiredBefore.toISOString()}`;

  const [bucket] = await context.db
    .insert(rateLimitBuckets)
    .values({ key: `${procedure}:${context.clientIp}`, windowStartedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        windowStartedAt: sql`CASE WHEN ${expired} THEN ${now.toISOString()}::timestamptz ELSE ${rateLimitBuckets.windowStartedAt} END`,
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
      },
    })
    .returning({
      windowStartedAt: rateLimitBuckets.windowStartedAt,
      count: rateLimitBuckets.count,
    });
  if (!bucket) throw new Error("rate_limit_buckets UPSERT가 행을 돌려주지 않았다");
  if (bucket.count <= limit) return null;

  const remainingMs = bucket.windowStartedAt.getTime() + windowMs - now.getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  context.resHeaders.set("retry-after", String(retryAfterSeconds));
  return retryAfterSeconds;
}
