import type { DesktopBridge } from "../shared/ipc.ts";

declare global {
  interface Window {
    /** The preload bridge: the renderer's only way out of its sandbox. */
    readonly desktop: DesktopBridge;
  }
}
