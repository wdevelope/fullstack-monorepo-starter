import type { PostDetail } from "@starter/contracts";

import { orpc, queryClient } from "../lib/api";

/** 변경 결과를 캐시된 글에 반영해, 다시 불러오지 않고도 화면이 바뀌게 한다. */
export function updateCachedPost(id: string, update: (post: PostDetail) => PostDetail) {
  queryClient.setQueryData(orpc.posts.get.queryKey({ input: { id } }), (post) =>
    post ? update(post) : post,
  );
}

/** 목록 행은 개수와 발췌를 보이므로, 글에 쓰기가 일어나면 불러온 페이지가 모두 오래된 것이 된다. */
export function refreshPostList() {
  void queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
}
