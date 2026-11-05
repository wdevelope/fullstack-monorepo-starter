import * as z from "zod";

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/** The cursor is the (created_at, id) of the last item, so new posts never shift later pages. */
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
