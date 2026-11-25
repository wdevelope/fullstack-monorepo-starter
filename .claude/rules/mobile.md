---
paths:
  - "apps/mobile/**"
---

# 모바일 (`apps/mobile`, Expo Router + NativeWind + TanStack Query) 규칙

공통 규칙은 루트 `AGENTS.md`. 여기에는 모바일에만 해당하는 것을 적는다.

## 작성 규칙

- **API 호출**: `src/lib/api.ts`의 `orpc`·`client`만 쓴다. 쿼리 키는 `orpc.<절차>.queryKey(...)`·`key()`로 만들고 문자열로 쓰지 않는다. 여러 화면이 함께 고치는 캐시는 `src/posts/cache.ts`처럼 한 곳에 모은다.
- **세션**: 리프레시 토큰은 `src/session/refresh-token-store.ts`(SecureStore)만 다룬다(AUTH-19). 로그인 상태는 `useUser()`로 읽고, 토큰을 화면·로그에 내보내지 않는다.
- **재시도**: 조회 재시도 정책은 `shouldRetry`(`src/lib/errors.ts`) 하나다. 서버가 의도해 돌려준 오류는 재시도하지 않는다(PLAT-3). 화면에서 `retry`를 따로 정하지 않는다.
- **오류 표시**: 문구는 `src/lib/errors.ts`에서만 만든다. 조회 실패는 `ErrorView`(다시 시도 포함), 폼 실패는 `ErrorBanner`, 로딩은 `LoadingView`(`src/components/feedback.tsx`).
- **폼 검증**: `src/lib/validation.ts`가 계약의 Zod 스키마로 검증한다. 길이 제한을 화면에 다시 적지 않는다.
- **화면**: 라우트는 `app/`(Expo Router 파일 기반)에 둔다. 한 도메인 전용 컴포넌트는 `src/<도메인>/`, 공용은 `src/components/`(`Button`·`TextButton`·`TextField`·`FormScreen`). 입력이 있는 화면은 `FormScreen`으로 감싸 키보드를 피한다.
- **스타일**: NativeWind `className`으로 쓴다. `style`은 계산된 값(Safe Area 여백 등)에만 쓴다.
- **포커스 갱신**: 실시간 스트림이 없으므로(D13) 알림함·배지처럼 바뀌는 값은 `useFocusEffect`로 화면에 들어올 때 다시 읽는다.
- **import**: Metro 규칙대로 상대 경로를 확장자 없이 쓴다. 워크스페이스 패키지는 `@starter/*`로 import한다.

## 테스트

- React Native를 테스트에 올리지 않는다. 순수 TypeScript 모듈(`src/lib/`의 오류·검증·시각, `src/session/` 토큰 저장소)만 Vitest로 테스트하고, 네이티브 모듈은 인자로 주입한다(`createRefreshTokenStore(SecureStore)` 선례).
- 화면은 시뮬레이터·실기기에서 확인해야 한다. 여기서 못 했으면 보고에 적는다. 번들이 깨지지 않았는지는 `apps/mobile`에서 `npx expo export --platform web --output-dir <임시 폴더>`로 확인할 수 있다.

## 함정

- `EXPO_PUBLIC_API_URL`은 빌드 때 번들에 박힌다. 바꾸면 Metro를 다시 띄운다. Android 에뮬레이터는 `10.0.2.2`, 실기기는 PC의 LAN IP가 필요하다.
- 앱 시작 때 저장된 토큰 복원이 끝나거나 몇 초가 지나야 스플래시를 내린다. 서버가 안 닿아도 로그아웃 상태로 열려야 하므로 이 대기 시간을 없애지 않는다.
- `ios/`·`android/`는 `expo prebuild`가 만드는 생성물이라 git에 없다. 네이티브 설정은 `app.json`에서 고친다.
- NativeWind는 Tailwind v3 기반이다. 웹(Tailwind v4)의 클래스·설정을 그대로 옮기면 안 맞는 것이 있다.
