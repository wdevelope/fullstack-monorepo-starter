import { router, type Href } from "expo-router";

/** 현재 화면을 닫는다. 그 화면이 첫 화면이었으면(예: 딥 링크) 대신 `fallback`을 연다. */
export function leave(fallback: Href = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
