import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createApiClient, watchNotifications } from "@starter/api-client";
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Notification,
  safeStorage,
  session,
  type IpcMainInvokeEvent,
} from "electron";

import { IPC } from "../shared/ipc.ts";
import { notificationText } from "../shared/notification-text.ts";
import { createIpcHandlers } from "./ipc-handlers.ts";
import { startNotificationForwarder } from "./notification-forwarder.ts";
import { createSafeStorageTokenStore } from "./token-store.ts";
import { createAppUrlCheck, readApiUrl } from "./urls.ts";

// Only unpackaged builds may load the dev server, so an env var cannot point a release at remote content.
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const rendererUrl =
  devServerUrl ?? pathToFileURL(join(import.meta.dirname, "../renderer/index.html")).href;
const isAppUrl = createAppUrlCheck(rendererUrl);

/** Linux falls back to a hard-coded key ("basic_text") without a keyring; that is not encryption. */
function isEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "Fullstack Starter",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#fafafa",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(rendererUrl);
  return window;
}

function isTrustedSender(event: IpcMainInvokeEvent) {
  return event.senderFrame !== null && isAppUrl(event.senderFrame.url);
}

function handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event)) throw new Error(`Blocked ${channel} from an untrusted frame`);
    return handler(...args);
  });
}

function start() {
  const apiUrl = readApiUrl(process.env);
  const client = createApiClient({
    url: apiUrl,
    clientKind: "native",
    refreshTokenStore: createSafeStorageTokenStore({
      safeStorage: {
        isEncryptionAvailable,
        encryptString: (plainText) => safeStorage.encryptString(plainText),
        decryptString: (encrypted) => safeStorage.decryptString(encrypted),
      },
      filePath: join(app.getPath("userData"), "session.bin"),
      apiUrl,
    }),
  });
  const handlers = createIpcHandlers(client);

  handle(IPC.restore, () => handlers.restore());
  handle(IPC.signIn, (input) => handlers.signIn(input));
  handle(IPC.signUp, (input) => handlers.signUp(input));
  handle(IPC.signOut, () => handlers.signOut());
  handle(IPC.rpc, (path, input) => handlers.rpc(path, input));

  client.subscribe(() => {
    const user = client.getUser();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC.userChanged, user);
    }
  });

  startNotificationForwarder({
    client,
    watch: watchNotifications,
    send(event) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC.notification, event);
      }
    },
    // Shown by main, so the renderer still needs no notification permission.
    show(notification) {
      if (!Notification.isSupported()) return;
      const shown = new Notification({ title: "Community", body: notificationText(notification) });
      shown.on("click", () => {
        const [window] = BrowserWindow.getAllWindows();
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.focus();
      });
      shown.show();
    },
  });

  // The renderer needs no camera, notifications, geolocation or anything else that asks.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Applies to every web contents, including any a bug or exploit manages to create.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

// Two instances would share one refresh token. Rotation turns the second refresh into a reuse,
// and the server then revokes the whole session (docs/specs/auth.md, rules 5 and 9).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  void app.whenReady().then(start);
}
