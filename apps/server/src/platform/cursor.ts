import * as z from "zod";

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/** 커서는 마지막 항목의 (created_at, id)다. 그래서 새 글이 들어와도 다음 페이지가 밀리지 않는다. */
export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([item.createdAt.toISOString(), item.id])).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    return parsed.success ? { createdAt: parsed.data[0], id: parsed.data[1] } : null;
  } catch {
    return null;
  }
}
