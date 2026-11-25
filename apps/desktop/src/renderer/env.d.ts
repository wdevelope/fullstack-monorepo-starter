import type { DesktopBridge } from "../shared/ipc.ts";

declare global {
  interface Window {
    /** preload 브리지: 렌더러가 샌드박스 밖으로 나가는 유일한 길. */
    readonly desktop: DesktopBridge;
  }
}
