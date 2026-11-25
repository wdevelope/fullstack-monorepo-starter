export const DEFAULT_API_URL = "http://localhost:3000/rpc";

/** 시작할 때 RPC 엔드포인트를 한 번 읽는다. 값이 틀리면 호출마다 실패하는 대신 앱을 멈춘다. */
export function readApiUrl(env: Record<string, string | undefined>): string {
  const value = env.STARTER_API_URL?.trim() || DEFAULT_API_URL;
  const url = URL.parse(value);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`STARTER_API_URL must be an http(s) URL, got "${value}"`);
  }
  return value;
}

/**
 * "이 URL이 우리 렌더러 페이지인가"를 판단하는 함수를 돌려준다. 운영에서는 번들된 `index.html`,
 * 개발에서는 개발 서버 origin이다. 페이지 이동과 IPC 발신자를 거르는 데 쓴다.
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
