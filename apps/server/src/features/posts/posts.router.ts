import { ORPCError } from "@orpc/server";

import { base, optionalUser, requireUser } from "../../platform/context.ts";
import {
  createPost,
  decodeCursor,
  deleteOwnPost,
  getPost,
  listPosts,
  postExists,
  setLike,
  updateOwnPost,
} from "./posts.service.ts";

export const postsRouter = {
  list: base.posts.list.handler(async ({ input, context }) => {
    const after = input.cursor ? decodeCursor(input.cursor) : null;
    if (input.cursor && !after) throw new ORPCError("BAD_REQUEST", { message: "Invalid cursor." });
    return listPosts(context.db, input.limit, after);
  }),

  get: base.posts.get.use(optionalUser).handler(async ({ input, context, errors }) => {
    const post = await getPost(context.db, input.id, context.userId);
    if (!post) throw errors.NOT_FOUND();
    return post;
  }),

  create: base.posts.create.use(requireUser).handler(async ({ input, context }) => {
    return { id: await createPost(context.db, context.userId, input) };
  }),

  update: base.posts.update.use(requireUser).handler(async ({ input, context, errors }) => {
    const { id, ...fields } = input;
    if (await updateOwnPost(context.db, context.userId, id, fields, context.now())) return { id };
    throw (await postExists(context.db, id)) ? errors.FORBIDDEN() : errors.NOT_FOUND();
  }),

  delete: base.posts.delete.use(requireUser).handler(async ({ input, context, errors }) => {
    if (await deleteOwnPost(context.db, context.userId, input.id)) return {};
    throw (await postExists(context.db, input.id)) ? errors.FORBIDDEN() : errors.NOT_FOUND();
  }),

  like: base.posts.like.use(requireUser).handler(async ({ input, context, errors }) => {
    if (!(await postExists(context.db, input.id))) throw errors.NOT_FOUND();
    return setLike(context.db, input.id, context.userId, true);
  }),

  unlike: base.posts.unlike.use(requireUser).handler(async ({ input, context, errors }) => {
    if (!(await postExists(context.db, input.id))) throw errors.NOT_FOUND();
    return setLike(context.db, input.id, context.userId, false);
  }),
};
