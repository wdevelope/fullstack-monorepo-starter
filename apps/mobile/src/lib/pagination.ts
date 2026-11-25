/** 무한 목록 화면이 보는 `useInfiniteQuery` 결과의 일부. */
interface LoadState {
  isError: boolean;
  data: unknown;
}

interface NextPageState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
}

/**
 * 보여 줄 글이 하나도 없는 채로 조회가 실패했는지. 이때 빈 목록을 그리면 "글이 없다"로 오해하므로
 * 오류와 다시 시도를 보인다. 이미 받은 글이 있으면 다시 읽기가 실패해도 목록을 그대로 둔다(PLAT-5).
 */
export function showsLoadError(query: LoadState): boolean {
  return query.isError && query.data === undefined;
}

/**
 * 목록 끝에 닿았을 때 다음 페이지를 요청할지. 다음 페이지가 실패한 뒤에는 자동으로 다시 요청하지 않고
 * 목록 끝의 "다시 시도"를 기다린다. 그렇지 않으면 스크롤할 때마다 실패한 요청을 되풀이한다(PLAT-5).
 */
export function shouldLoadMore(query: NextPageState): boolean {
  return query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;
}
