import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { posts, workspaceMembers } from "../../db/schema.ts";

/**
 * SQL conditions on the `posts` row in scope. They are embedded in the statement that reads or
 * writes, so membership is checked atomically with the access (WS rule 7).
 *
 * `who` is a user ID, or a column such as `posts.author_id` when the reader is the post's author.
 */
export function canReadPost(who: string | SQLWrapper | null): SQL {
  if (who === null) return sql`${posts.workspaceId} IS NULL`;
  return sql`(${posts.workspaceId} IS NULL OR EXISTS (
    SELECT 1 FROM ${workspaceMembers}
    WHERE ${workspaceMembers.workspaceId} = ${posts.workspaceId} AND ${workspaceMembers.userId} = ${who}
  ))`;
}

/** Workspace admins and the owner may delete anyone's posts and comments there (WS rule 6). */
export function canModeratePost(userId: string): SQL {
  return sql`(${posts.workspaceId} IS NOT NULL AND EXISTS (
    SELECT 1 FROM ${workspaceMembers}
    WHERE ${workspaceMembers.workspaceId} = ${posts.workspaceId}
      AND ${workspaceMembers.userId} = ${userId}
      AND ${workspaceMembers.role} IN ('owner', 'admin')
  ))`;
}
