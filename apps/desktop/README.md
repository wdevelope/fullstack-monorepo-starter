# @starter/desktop

커뮤니티 게시판, 워크스페이스, 알림을 위한 Electron 클라이언트다(Electron 44, electron-vite, React 19, TanStack Query, Tailwind v4). 세션은 메인 프로세스가 갖고 API와 통신한다. 렌더러는 네트워크에 접근할 수 없는 샌드박스 페이지다.

## 실행

```bash
pnpm db:up && pnpm --filter @starter/server db:migrate
pnpm --filter @starter/server dev     # API: http://localhost:3000/rpc
pnpm --filter @starter/desktop dev    # 처음 실행할 때 Electron 바이너리를 내려받는다

STARTER_API_URL=https://api.example.com/rpc pnpm --filter @starter/desktop dev   # 다른 서버

pnpm --filter @starter/desktop package   # release/에 dmg / nsis / AppImage
```

`typecheck`, `test`, `build`는 Electron 바이너리 없이 동작한다. 테스트는 메인 프로세스의 순수 모듈만 다루고 `electron`을 가져오지 않는다.

## 구조

| 경로            | 실행 위치                 | 하는 일                                                 |
| --------------- | ------------------------- | ------------------------------------------------------- |
| `src/main/`     | 메인 프로세스(Node)       | 창, 보안 강화, IPC 핸들러, api 클라이언트, 토큰 저장소  |
| `src/preload/`  | 샌드박스 preload          | `window.desktop` 노출: 세션 브리지와 `rpc(path, input)` |
| `src/shared/`   | 양쪽                      | IPC 채널 이름, 브리지 타입, 오류 직렬화·역직렬화        |
| `src/renderer/` | 샌드박스 렌더러(Chromium) | React 앱. 브리지 위의 oRPC 링크로 API를 부른다          |

## 보안 모델

동작은 [docs/specs/desktop.md](../../docs/specs/desktop.md)의 DESK-1~15 시나리오가 정의하고, 테스트 제목이 그 ID로 시작한다.

- **잠긴 렌더러.** `contextIsolation`, `sandbox`를 켜고 `nodeIntegration`은 끈다. `window.open`, 앱 페이지 밖으로의 이동, `<webview>`, 권한 요청은 모든 web contents에서 거부한다(이동 허용 범위는 DESK-14).
- **렌더러에는 네트워크가 없다.** 운영 CSP는 `default-src 'none'`과 `connect-src 'none'`이다. 스크립트와 스타일은 번들에서만 불러온다. 모든 API 호출은 `window.desktop.rpc`를 거쳐 메인으로 가고, 메인은 `clientKind: "native"`로 `@starter/api-client`를 쓴다.
- **토큰은 메인에만 있다.** 액세스 토큰은 메인의 메모리에 있다. 리프레시 토큰은 `safeStorage`로 암호화해 `userData/session.bin`에 두고, 그것을 발급한 서버에만 돌려준다(DESK-11, DESK-13). OS 암호화가 없으면(Linux의 `basic_text` 대체 포함) 메모리에만 두고 평문으로는 절대 쓰지 않는다(DESK-12). 브리지는 사용자를 돌려줄 뿐 토큰은 돌려주지 않는다(DESK-9, DESK-10).
- **좁고 검증된 IPC.** 브리지 메서드마다 고정된 채널이 하나 있고, 메인은 앱 페이지가 아닌 프레임에서 온 호출을 거부한다. `rpc`는 `auth.me`, `posts.*`, `comments.*`, `workspaces.*`, `notifications.list`/`unreadCount`/`markRead`만 받는다. 가입·로그인·갱신·로그아웃은 거부하며, 렌더러의 클라이언트 타입에는 아예 없다(DESK-1). 메인은 모든 입력을 계약의 Zod 스키마로 파싱한 뒤에 보낸다(DESK-2~4). 오류는 평범한 데이터로 돌아와 렌더러에서 `ORPCError`로 다시 만들어지고, 예상하지 못한 오류의 메시지·cause·stack은 넘어오지 않는다(DESK-5~8).
- **갱신은 한 번에 하나.** 단일 인스턴스 잠금으로 앱 인스턴스 두 개가 같은 리프레시 토큰을 회전하지 못하게 한다. 그러면 서버는 탈취로 보고 세션을 폐기한다.
- **강화된 패키지.** 릴리스 빌드는 Electron fuse를 바꾸고(`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect` 금지, `app.asar`의 코드만 실행) `ELECTRON_RENDERER_URL`을 무시한다. 메인과 preload를 모두 번들하므로 `node_modules`가 배포되지 않는다. API 주소는 `STARTER_API_URL`이 http(s) URL일 때만 바꿀 수 있다(DESK-15).
- **알림도 메인에 있다.** `notifications.stream`은 `rpc` 호출이 아니다. 메인은 사용자가 로그인한 동안 SSE 스트림을 열어 두고(`src/main/notification-forwarder.ts`, `watchNotifications` 사용), 사용자가 바뀌면 다시 시작하며, 이벤트마다 전용 IPC 채널(`notifications:event`)로 렌더러에 전달하고 Electron `Notification`을 직접 띄운다. 그래서 렌더러는 여전히 네트워크도 알림 권한도 없다([notifications.md](../../docs/specs/notifications.md) NOTI-6, NOTI-8).
