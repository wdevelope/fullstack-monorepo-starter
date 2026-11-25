import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { posts, workspaceMembers } from "../../db/schema.ts";

/**
 * 범위 안의 `posts` 행에 거는 SQL 조건이다. 읽거나 쓰는 문 안에 넣으므로 멤버 여부를 접근과
 * 원자적으로 확인한다(WS 규칙 7).
 *
 * `who`는 사용자 ID이거나, 읽는 사람이 글 작성자일 때는 `posts.author_id` 같은 컬럼이다.
 */
export function canReadPost(who: string | SQLWrapper | null): SQL {
  if (who === null) return sql`${posts.workspaceId} IS NULL`;
  return sql`(${posts.workspaceId} IS NULL OR EXISTS (
    SELECT 1 FROM ${workspaceMembers}
    WHERE ${workspaceMembers.workspaceId} = ${posts.workspaceId} AND ${workspaceMembers.userId} = ${who}
  ))`;
}

/** 워크스페이스의 관리자와 소유자는 그 안의 누구 글과 댓글이든 지울 수 있다(WS 규칙 6). */
export function canModeratePost(userId: string): SQL {
  return sql`(${posts.workspaceId} IS NOT NULL AND EXISTS (
    SELECT 1 FROM ${workspaceMembers}
    WHERE ${workspaceMembers.workspaceId} = ${posts.workspaceId}
      AND ${workspaceMembers.userId} = ${userId}
      AND ${workspaceMembers.role} IN ('owner', 'admin')
  ))`;
}
