import { oc } from "@orpc/contract";
import * as z from "zod";

export const POST_TITLE_MAX = 100;
export const POST_BODY_MAX = 10_000;
export const COMMENT_BODY_MAX = 1_000;
export const POST_EXCERPT_LENGTH = 140;

const authorSchema = z.object({ id: z.uuid(), nickname: z.string() });

export const commentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  author: authorSchema,
  createdAt: z.date(),
});
export type Comment = z.infer<typeof commentSchema>;

export const postSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  excerpt: z.string(),
  author: authorSchema,
  createdAt: z.date(),
  commentCount: z.number().int(),
  likeCount: z.number().int(),
});
export type PostSummary = z.infer<typeof postSummarySchema>;

export const postDetailSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  author: authorSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  likeCount: z.number().int(),
  likedByMe: z.boolean(),
  comments: z.array(commentSchema),
});
export type PostDetail = z.infer<typeof postDetailSchema>;

export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(POST_TITLE_MAX),
  body: z.string().trim().min(1).max(POST_BODY_MAX),
});

const byId = z.object({ id: z.uuid() });
const likeState = z.object({ likeCount: z.number().int(), likedByMe: z.boolean() });

const NOT_FOUND = { status: 404, message: "Not found." } as const;
const FORBIDDEN = { status: 403, message: "Only the author can do this." } as const;

export const postsContract = {
  list: oc
    .input(
      z.object({
        cursor: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .output(z.object({ items: z.array(postSummarySchema), nextCursor: z.string().nullable() })),

  get: oc.input(byId).output(postDetailSchema).errors({ NOT_FOUND }),

  create: oc.input(postInputSchema).output(z.object({ id: z.uuid() })),

  update: oc
    .input(byId.extend(postInputSchema.shape))
    .output(z.object({ id: z.uuid() }))
    .errors({ NOT_FOUND, FORBIDDEN }),

  delete: oc.input(byId).output(z.object({})).errors({ NOT_FOUND, FORBIDDEN }),

  like: oc.input(byId).output(likeState).errors({ NOT_FOUND }),

  unlike: oc.input(byId).output(likeState).errors({ NOT_FOUND }),
};

export const commentsContract = {
  create: oc
    .input(z.object({ postId: z.uuid(), body: z.string().trim().min(1).max(COMMENT_BODY_MAX) }))
    .output(commentSchema)
    .errors({ NOT_FOUND }),

  delete: oc.input(byId).output(z.object({})).errors({ NOT_FOUND, FORBIDDEN }),
};
