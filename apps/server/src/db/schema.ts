import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp(ts).notNull().defaultNow(),
    updatedAt: timestamp(ts).notNull().defaultNow(),
  },
  (t) => [index().on(t.createdAt.desc(), t.id.desc())],
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

/** Tables the integration tests empty between cases, children first. */
export const allTables = sql`post_likes, comments, posts, refresh_tokens, users`;
