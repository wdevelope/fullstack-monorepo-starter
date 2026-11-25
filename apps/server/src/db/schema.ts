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

// 밀리초 정밀도는 JavaScript Date와 같으므로 keyset 커서가 값을 정확히 주고받는다.
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
    // 워크스페이스마다 소유자는 정확히 한 명이다(WS 규칙 1).
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
    /** `null`이면 공개 게시판이다. */
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
    // 글과 댓글을 연쇄 삭제할 때 이 인덱스로 해당 알림을 찾는다.
    index().on(t.postId),
    index().on(t.commentId),
    // 좋아요를 취소했다가 다시 눌러도 누른 사람과 글 한 쌍에 좋아요 알림은 하나다(NOTI 규칙 2).
    uniqueIndex("notifications_one_like_per_actor")
      .on(t.postId, t.actorId)
      .where(sql`${t.type} = 'like'`),
  ],
);

/** 통합 테스트가 케이스마다 비우는 테이블이다. 자식 테이블이 먼저 온다. */
export const allTables = sql`notifications, post_likes, comments, posts, workspace_members, workspaces, refresh_tokens, users`;
