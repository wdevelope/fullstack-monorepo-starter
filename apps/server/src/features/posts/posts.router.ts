import { ORPCError } from "@orpc/server";

import { base, optionalUser, requireUser } from "../../platform/context.ts";
import { decodeCursor } from "../../platform/cursor.ts";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  postReadable,
  setLike,
  updateOwnPost,
} from "./posts.service.ts";

export const postsRouter = {
  list: base.posts.list.use(optionalUser).handler(async ({ input, context, errors }) => {
    const after = input.cursor ? decodeCursor(input.cursor) : null;
    if (input.cursor && !after) throw new ORPCError("BAD_REQUEST", { message: "Invalid cursor." });
    const page = await listPosts(context.db, {
      limit: input.limit,
      after,
      workspaceId: input.workspaceId,
      viewerId: context.userId,
    });
    if (!page) throw errors.NOT_FOUND();
    return page;
  }),

  get: base.posts.get.use(optionalUser).handler(async ({ input, context, errors }) => {
    const post = await getPost(context.db, input.id, context.userId);
    if (!post) throw errors.NOT_FOUND();
    return post;
  }),

  create: base.posts.create.use(requireUser).handler(async ({ input, context, errors }) => {
    const id = await createPost(context.db, context.userId, input);
    if (!id) throw errors.NOT_FOUND();
    return { id };
  }),

  update: base.posts.update.use(requireUser).handler(async ({ input, context, errors }) => {
    const { id, ...fields } = input;
    if (await updateOwnPost(context.db, context.userId, id, fields, context.now())) return { id };
    throw (await postReadable(context.db, id, context.userId))
      ? errors.FORBIDDEN()
      : errors.NOT_FOUND();
  }),

  delete: base.posts.delete.use(requireUser).handler(async ({ input, context, errors }) => {
    if (await deletePost(context.db, context.userId, input.id)) return {};
    throw (await postReadable(context.db, input.id, context.userId))
      ? errors.FORBIDDEN()
      : errors.NOT_FOUND();
  }),

  like: base.posts.like.use(requireUser).handler(async ({ input, context, errors }) => {
    const state = await setLike(context.db, input.id, context.userId, true);
    if (!state) throw errors.NOT_FOUND();
    return state;
  }),

  unlike: base.posts.unlike.use(requireUser).handler(async ({ input, context, errors }) => {
    const state = await setLike(context.db, input.id, context.userId, false);
    if (!state) throw errors.NOT_FOUND();
    return state;
  }),
};
