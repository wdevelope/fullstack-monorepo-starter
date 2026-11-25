import type { NotificationEvent, User } from "@starter/contracts";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { IPC, type DesktopBridge } from "../shared/ipc.ts";

// 메서드마다 고정된 채널 하나에 대응한다. 페이지는 ipcRenderer 자체를 받지 못하므로
// 메인이 기대하지 않는 채널로 보낼 수 없다.
const bridge: DesktopBridge = {
  session: {
    restore: () => ipcRenderer.invoke(IPC.restore),
    signIn: (input) => ipcRenderer.invoke(IPC.signIn, input),
    signUp: (input) => ipcRenderer.invoke(IPC.signUp, input),
    signOut: () => ipcRenderer.invoke(IPC.signOut),
    onUserChange(listener) {
      // 사용자만 넘긴다. IPC 이벤트 객체를 넘기면 발신자가 페이지에 드러난다.
      const forward = (_event: IpcRendererEvent, user: User | null) => listener(user);
      ipcRenderer.on(IPC.userChanged, forward);
      return () => {
        ipcRenderer.removeListener(IPC.userChanged, forward);
      };
    },
  },
  rpc: (path, input) => ipcRenderer.invoke(IPC.rpc, path, input),
  onNotification(listener) {
    const forward = (_event: IpcRendererEvent, event: NotificationEvent) => listener(event);
    ipcRenderer.on(IPC.notification, forward);
    return () => {
      ipcRenderer.removeListener(IPC.notification, forward);
    };
  },
};

contextBridge.exposeInMainWorld("desktop", bridge);
