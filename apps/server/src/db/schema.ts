import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Millisecond precision matches JavaScript Date, so keyset cursors round-trip exactly.
const ts = { withTimezone: true, precision: 3 } as const;

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  nickname: text().notNull(),
  passwordHash: text().notNull(),
  failedLoginCount: integer().notNull().default(0),
  lockedUntil: timestamp(ts),
  createdAt: timestamp(ts).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp(ts).notNull(),
    revokedAt: timestamp(ts),
    replacedById: uuid(),
    createdAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [index().on(t.familyId)],
);

export const workspaces = pgTable("workspaces", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp(ts).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: ["owner", "admin", "member"] }).notNull(),
    createdAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    check("workspace_members_role_check", sql`${t.role} IN ('owner', 'admin', 'member')`),
    // Exactly one owner per workspace (WS rule 1).
    uniqueIndex("workspace_members_one_owner")
      .on(t.workspaceId)
      .where(sql`${t.role} = 'owner'`),
    index().on(t.userId),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `null` is the public board. */
    workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp(ts).notNull().defaultNow(),
    updatedAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.createdAt.desc(), t.id.desc()),
    index().on(t.workspaceId, t.createdAt.desc(), t.id.desc()),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [index().on(t.postId, t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text({ enum: ["comment", "like"] }).notNull(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid().references(() => comments.id, { onDelete: "cascade" }),
    createdAt: timestamp(ts).notNull().defaultNow(),
    readAt: timestamp(ts),
  },
  (t) => [
    check("notifications_type_check", sql`${t.type} IN ('comment', 'like')`),
    index().on(t.recipientId, t.createdAt.desc(), t.id.desc()),
    // Cascading deletes of posts and comments find their notifications through these.
    index().on(t.postId),
    index().on(t.commentId),
    // One like notification per liker and post, even after unlike and like (NOTI rule 2).
    uniqueIndex("notifications_one_like_per_actor")
      .on(t.postId, t.actorId)
      .where(sql`${t.type} = 'like'`),
  ],
);

/** Tables the integration tests empty between cases, children first. */
export const allTables = sql`notifications, post_likes, comments, posts, workspace_members, workspaces, refresh_tokens, users`;
