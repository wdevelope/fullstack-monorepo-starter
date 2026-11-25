---
paths:
  - "apps/web/**"
---

# 웹 (`apps/web`, Vite + React 19 + TanStack Router/Query + Tailwind v4) 규칙

공통 규칙은 루트 `AGENTS.md`. 여기에는 웹에만 해당하는 것을 적는다.

## 작성 규칙

- **API 호출**: `src/lib/api.ts`의 `orpc`(TanStack Query 유틸)와 `client`만 쓴다. 읽기는 `useQuery(orpc.<절차>.queryOptions(...))`·`useInfiniteQuery(orpc.<절차>.infiniteOptions(...))`, 쓰기는 `useMutation(orpc.<절차>.mutationOptions(...))`. `fetch`나 쿼리 키 문자열을 직접 쓰지 않는다.
- **캐시 갱신**: 쓰기가 끝나면 `orpc.<절차>.key()`(상위 키)로 `invalidateQueries`한다. 결과를 알고 있으면 `setQueryData`로 바로 반영한다(`routes/post.tsx`의 좋아요 선례).
- **서버 데이터 복제 금지**: query `data`를 `useState`에 복사하거나 `useEffect`로 동기화하지 않는다. 파생값은 렌더 중에 계산한다. 서버 데이터로 폼을 채울 때는 데이터가 준비된 뒤 폼을 `key={id}`로 마운트해 초기값으로 받는다.
- **`useEffect`는 바깥 시스템과 맞출 때만** 쓴다(알림 스트림 구독, 타이머, 문서 제목). prop이 바뀔 때의 리셋은 `key`로 한다.
- **로그인 상태**: `useUser()`(`useSyncExternalStore`)로 읽는다. 로그인이 필요한 라우트는 `router.tsx`의 `beforeLoad: requireUser`로 막고, 로그인 뒤 돌아갈 주소는 `safeRedirect`로 같은 앱 경로만 허용한다.
- **오류 표시**: 오류 문구는 `describeError(error)`(`src/lib/errors.ts`)로만 만든다. 계약의 타입 있는 오류는 서버 메시지를, 예상하지 못한 오류는 일반 문구를 보인다(PLAT-1·2). 조회 실패와 빈 목록을 구분해 보인다.
- **폼 검증**: 계약의 Zod 스키마(`@starter/contracts`)를 그대로 써서 서버와 같은 규칙으로 검증한다. 길이 제한 같은 숫자를 화면에 다시 적지 않는다.
- **UI**: 공용 컴포넌트(`src/components/ui.tsx`의 `Button`·`Field`·`TextInput`·`ErrorBanner`·`Card`)를 먼저 쓴다. 같은 모양을 두 화면 이상에서 쓰게 되면 여기에 올린다. 스타일은 Tailwind 클래스로 쓰고 `style={{}}`은 계산된 값에만 쓴다.
- **문구**: 사용자에게 보이는 글은 한국어 해요체. 시각은 `timeAgo`(`src/lib/time.ts`)로 보인다(PLAT-4).

## 구조

- `src/main.tsx`: `QueryClientProvider` + `RouterProvider`. 첫 렌더 전에 저장된 쿠키로 세션 복원을 시도한다.
- `src/router.tsx`: 코드 기반 라우트 트리(파일 기반 라우팅 아님). 새 화면은 `src/routes/<이름>.tsx`에 만들고 여기에 등록한다.
- `src/lib/api.ts`: `createApiClient({ clientKind: "web" })` 하나. 리프레시 토큰은 HttpOnly 쿠키라 페이지가 읽을 수 없다(D3).
- `src/lib/notifications.ts`: 알림 문구와 실시간 스트림(`watchNotifications`) 연결. 레이아웃의 알림 종이 구독한다.
- 개발 서버는 `/rpc`를 API 서버로 프록시한다. 그래서 개발 중에도 쿠키가 같은 출처(first-party)다.

## 테스트

- 화면은 단위 테스트하지 않는다. 순수 로직(`src/lib/`의 오류 문구, 시간 표시, 알림 문구)만 Vitest로 테스트한다.
- 사용자 흐름은 `e2e/`의 Playwright 테스트(`pnpm --filter @starter/web test:e2e`)가 실제 서버·DB·브라우저로 확인한다. 설정(`playwright.config.ts`)이 테스트 DB에 마이그레이션한 서버(3100)와 웹(5174)을 직접 띄운다. 테스트 제목은 시나리오 ID로 시작하고 CI의 `e2e` 잡에서 돈다.
- E2E 셀렉터는 역할과 이름(`getByRole`, `getByLabel`)으로 찾는다. 화면 문구를 바꾸면 E2E도 함께 고친다.
- `e2e/`는 Vitest가 집지 않게 `vitest.config.ts`에서 뺐고, 타입 검사는 `e2e/tsconfig.json`(Node 타입)으로 따로 한다.

## 함정

- `VITE_API_URL`을 비워 두면 `window.location.origin + /rpc`를 쓴다. 다른 출처의 API를 쓰면 `SameSite=Strict` 쿠키가 가지 않으므로 운영에서는 같은 사이트에 둔다.
- 서버의 `CORS_ORIGINS`에 웹 주소가 없으면 개발 프록시 없이 띄웠을 때 모든 호출이 실패한다.
