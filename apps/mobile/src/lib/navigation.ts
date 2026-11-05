import { router, type Href } from "expo-router";

/** Closes the current screen, or opens `fallback` when it was the first one (e.g. a deep link). */
export function leave(fallback: Href = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
