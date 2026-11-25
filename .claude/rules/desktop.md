---
paths:
  - "apps/desktop/**"
---

# 데스크톱 (`apps/desktop`, Electron + electron-vite + React 19 + TanStack Query) 규칙

공통 규칙은 루트 `AGENTS.md`. 보안 모델의 정본은 [desktop.md 명세](../../docs/specs/desktop.md)(DESK-1~15)와 D6이다.

## 프로세스와 폴더

| 경로            | 실행 위치                 | 하는 일                                                        |
| --------------- | ------------------------- | -------------------------------------------------------------- |
| `src/main/`     | 메인 프로세스(Node)       | 창·보안 설정, IPC 핸들러, api-client, 토큰 저장소, 알림 스트림 |
| `src/preload/`  | 샌드박스 preload          | `window.desktop`(세션 브리지, `rpc(path, input)`)만 노출       |
| `src/shared/`   | 양쪽                      | IPC 채널 이름, 브리지 타입, 오류 직렬화, 알림 문구             |
| `src/renderer/` | 샌드박스 렌더러(Chromium) | React 앱. 브리지 위의 oRPC 링크로 API를 부른다                 |

## 작성 규칙

- **렌더러에는 네트워크와 토큰이 없다.** 렌더러에서 `fetch`·`WebSocket`·`@starter/api-client`를 쓰지 않는다. CSP가 `connect-src 'none'`이라 운영에서는 어차피 실패한다. API는 `src/renderer/lib/orpc.ts`의 `orpc`/`client`(브리지 링크)로만 부른다.
- **새 절차를 렌더러에 열 때**: `src/main/ipc-handlers.ts`의 허용 목록과 `src/shared/ipc.ts`의 `RendererContract`를 함께 고치고, 허용 목록 테스트(DESK-1)를 먼저 고친다. 세션 절차(`auth.signup`·`login`·`refresh`·`logout`)와 `notifications.stream`은 열지 않는다.
- **IPC 채널**: 브리지 메서드마다 채널 하나를 `IPC` 상수에 둔다. 메인 핸들러는 앱 페이지가 아닌 프레임에서 온 호출을 거부하고, 입력을 계약 스키마로 파싱한 뒤에만 보낸다(DESK-2·3).
- **오류**: IPC로는 `IpcResult`(`{ ok, data | error }`) 봉투만 보낸다. 오류는 `src/shared/ipc-errors.ts`로 직렬화·복원한다. 예상하지 못한 오류의 메시지·stack을 렌더러로 보내지 않는다(DESK-6).
- **토큰**: 리프레시 토큰은 `src/main/token-store.ts`만 다룬다. `safeStorage`를 못 쓰면 메모리에만 두고 평문 파일을 만들지 않는다(DESK-12). 브리지는 사용자 정보만 돌려준다.
- **창·이동**: 새 창, 외부 이동, `<webview>`, 권한 요청은 모두 거부한다. 허용 URL 판단은 `src/main/urls.ts` 한 곳에서 한다(DESK-14).
- **렌더러 화면**: 라우터 라이브러리 없이 `src/renderer/lib/navigation.ts`의 `View` 유니온으로 화면을 바꾼다. 새 화면은 `View`에 종류를 더하고 `App.tsx`에서 그린다. 공용 UI는 `src/renderer/components/ui.tsx`, 오류 문구는 `src/renderer/lib/errors.ts`, 시각은 `src/renderer/lib/format.ts`.
- **알림**: 스트림은 메인(`notification-forwarder.ts`)이 열고, 이벤트를 `notifications:event` 채널로 렌더러에 보내고 시스템 알림도 직접 띄운다. 렌더러에 알림 권한을 주지 않는다.

## 테스트

- 메인 프로세스의 순수 모듈(`ipc-handlers`, `token-store`, `urls`, `notification-forwarder`, `shared/*`)만 Vitest로 테스트하고, 테스트에서 `electron`을 import하지 않는다. Electron 의존은 함수 인자로 주입한다(`token-store.ts`의 `safeStorage` 선례).
- `typecheck`·`test`·`build`는 Electron 바이너리 없이 돈다. 창을 띄우는 확인(`pnpm --filter @starter/desktop dev`)은 데스크톱 환경이 필요하다. 못 했으면 보고에 적는다.

## 함정

- 앱 인스턴스가 둘이면 같은 리프레시 토큰을 두 번 회전해 서버가 탈취로 보고 패밀리를 폐기한다(D2, D5). 단일 인스턴스 잠금(`requestSingleInstanceLock`)을 지우지 않는다.
- 운영 빌드는 Electron fuse로 `ELECTRON_RUN_AS_NODE`·`NODE_OPTIONS`·`--inspect`를 끄고 `ELECTRON_RENDERER_URL`을 무시한다. 개발 편의를 위해 운영 분기를 풀지 않는다.
- CSP는 `electron.vite.config.ts`가 빌드 때 `index.html`의 자리표시자에 넣는다. 개발 CSP만 Vite HMR용 `ws://localhost`를 허용한다.
