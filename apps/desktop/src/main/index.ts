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

// 패키징하지 않은 빌드만 개발 서버를 불러온다. 그래서 환경 변수로 릴리스 빌드가 원격 콘텐츠를 열게 할 수 없다.
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const rendererUrl =
  devServerUrl ?? pathToFileURL(join(import.meta.dirname, "../renderer/index.html")).href;
const isAppUrl = createAppUrlCheck(rendererUrl);

/** 키링이 없는 Linux는 하드코딩된 키("basic_text")로 대신한다. 이것은 암호화가 아니다. */
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
    title: "커뮤니티",
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
    // 메인이 띄우므로 렌더러에는 여전히 알림 권한이 필요 없다.
    show(notification) {
      if (!Notification.isSupported()) return;
      const shown = new Notification({ title: "커뮤니티", body: notificationText(notification) });
      shown.on("click", () => {
        const [window] = BrowserWindow.getAllWindows();
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.focus();
      });
      shown.show();
    },
  });

  // 렌더러에는 카메라·알림·위치 정보처럼 권한을 묻는 기능이 하나도 필요 없다.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// 버그나 공격으로 만들어진 것까지 포함해 모든 web contents에 적용한다.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

// 인스턴스 두 개는 리프레시 토큰 하나를 나눠 쓰게 된다. 회전 때문에 두 번째 갱신은 재사용이 되고,
// 서버는 그 세션 전체를 폐기한다(docs/specs/auth.md 규칙 5, 9).
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
