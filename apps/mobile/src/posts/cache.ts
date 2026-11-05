import type { PostDetail } from "@starter/contracts";

import { orpc, queryClient } from "../lib/api";

/** Applies a mutation's result to the cached post, so the screen updates without a refetch. */
export function updateCachedPost(id: string, update: (post: PostDetail) => PostDetail) {
  queryClient.setQueryData(orpc.posts.get.queryKey({ input: { id } }), (post) =>
    post ? update(post) : post,
  );
}

/** List rows show counts and excerpts, so any write to a post makes the loaded pages stale. */
export function refreshPostList() {
  void queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
}
