---
paths:
  - "packages/**"
---

# 공유 패키지 (`packages/contracts`, `packages/api-client`) 규칙

공통 규칙은 루트 `AGENTS.md`. 두 패키지는 빌드 없이 TypeScript 소스를 그대로 내보내고(`main`이 `src/index.ts`), 서버·웹·데스크톱·모바일이 모두 import한다. 여기서의 변경은 네 앱 모두에 영향을 준다.

## 계약 (`packages/contracts`)

- **API의 유일한 정의**다. 절차마다 입력·출력 Zod 스키마와 타입 있는 오류(`.errors({ CODE: { status, message, data? } })`)를 둔다. 서버와 클라이언트는 여기서만 타입을 얻는다(D1).
- **입력 정규화는 스키마에서**: 이메일 소문자화, 앞뒤 공백 제거 같은 변환은 스키마의 `.trim()`·`.toLowerCase()`로 한다. 서버·클라이언트에서 다시 하지 않는다.
- 길이 제한 같은 숫자는 상수로 내보내 클라이언트 폼이 같은 값을 쓰게 한다(`POST_TITLE_MAX`·`COMMENT_BODY_MAX` 선례).
- **호환성**: 출시된 앱이 옛 계약으로 남아 있다. 필드 추가·선택 값을 우선하고, 이름 변경·삭제·필수화는 명세에서 이전 계획을 먼저 정한다.
- 오류 `message`는 사용자에게 그대로 보일 수 있으므로 한국어 해요체로 쓴다. 코드는 영어 대문자다.
- 새 도메인은 `src/<도메인>.ts`를 만들고 `src/index.ts`의 `contract`에 등록한다. 입력 검증 테스트(`src/<도메인>.test.ts`)를 함께 쓴다.
- 런타임 의존성은 `@orpc/contract`와 `zod`뿐이다. 서버 전용 코드(DB, Node API)를 넣지 않는다. 모바일 번들에 함께 들어간다.

## API 클라이언트 (`packages/api-client`)

- `createApiClient({ url, clientKind, refreshTokenStore? })`가 세션을 갖는다. 액세스 토큰은 메모리에만 두고, 리프레시 토큰은 주입받은 저장소(모바일 SecureStore, 데스크톱 메인 `safeStorage`)나 웹 쿠키에 둔다.
- **리프레시는 하나만 띄운다**(D5). 만료로 실패한 동시 호출들은 진행 중인 리프레시를 함께 기다렸다가 한 번씩 다시 보낸다. 이 흐름을 바꾸면 AUTH-16·17 테스트를 먼저 고친다.
- 서버가 리프레시를 거부하면 저장된 토큰을 지우고 로그아웃 상태로 바꾼다. 네트워크 오류로는 지우지 않는다.
- `watchNotifications`는 스트림이 토큰 만료로 끝나면 리프레시 후 다시 열고, 네트워크 오류에는 백오프로 재시도하며, 리프레시가 안 되면 멈춘다(NOTI-8).
- 플랫폼 API(`window`, `expo-*`, `electron`)를 import하지 않는다. 플랫폼별 부분은 옵션으로 주입받는다.

## 테스트

- 계약: 스키마의 정규화·거부를 시나리오 ID로 테스트한다(`AUTH-3`, `COM-5` …).
- 클라이언트: 주입한 `fetch`가 메모리 안의 oRPC 핸들러(`RPCHandler`)를 부르게 해서 동시성(리프레시 공유)과 실패 경로를 테스트한다. 실제 서버·DB를 띄우지 않는다.
