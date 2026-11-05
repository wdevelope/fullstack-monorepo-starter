import type { NotificationEvent, User } from "@starter/contracts";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { IPC, type DesktopBridge } from "../shared/ipc.ts";

// Each method maps to one fixed channel. The page never gets ipcRenderer itself, so it cannot
// send to channels main does not expect.
const bridge: DesktopBridge = {
  session: {
    restore: () => ipcRenderer.invoke(IPC.restore),
    signIn: (input) => ipcRenderer.invoke(IPC.signIn, input),
    signUp: (input) => ipcRenderer.invoke(IPC.signUp, input),
    signOut: () => ipcRenderer.invoke(IPC.signOut),
    onUserChange(listener) {
      // Forward the user only: the IPC event object would expose the sender to the page.
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
