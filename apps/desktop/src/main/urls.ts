export const DEFAULT_API_URL = "http://localhost:3000/rpc";

/** Reads the RPC endpoint once at startup. A bad value stops the app instead of failing per call. */
export function readApiUrl(env: Record<string, string | undefined>): string {
  const value = env.STARTER_API_URL?.trim() || DEFAULT_API_URL;
  const url = URL.parse(value);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`STARTER_API_URL must be an http(s) URL, got "${value}"`);
  }
  return value;
}

/**
 * Returns a predicate for "this URL is our own renderer page": the bundled `index.html` in
 * production, or the dev server origin in development. Used to gate navigation and IPC senders.
 */
export function createAppUrlCheck(rendererUrl: string): (url: string) => boolean {
  const app = new URL(rendererUrl);
  return (candidate) => {
    const url = URL.parse(candidate);
    if (!url) return false;
    if (app.protocol === "file:") return url.protocol === "file:" && url.pathname === app.pathname;
    return url.origin === app.origin;
  };
}
