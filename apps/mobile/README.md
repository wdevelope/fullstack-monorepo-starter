# @starter/mobile

iOS·Android 클라이언트다. `@starter/api-client` 위에 Expo Router, NativeWind(Tailwind v3), TanStack
Query를 쓴다. [`docs/specs/community.md`](../../docs/specs/community.md)의 공개 게시판,
[`docs/specs/auth.md`](../../docs/specs/auth.md)의 네이티브 쪽, 워크스페이스 게시판, 알림함을 구현한다.

## 실행

먼저 저장소 루트에서 API를 띄운다. `apps/server/.env.example`을 `apps/server/.env`로 복사한 뒤
`pnpm db:up`, `pnpm --filter @starter/server db:migrate`, `pnpm --filter @starter/server dev`를
실행한다. 서버는 모든 인터페이스의 3000번 포트에서 듣기 때문에 같은 네트워크의 기기에서도 닿는다.

```bash
pnpm --filter @starter/mobile dev       # Metro. i(iOS 시뮬레이터), a(Android 에뮬레이터)를 누르거나 QR 코드를 스캔한다
pnpm --filter @starter/mobile ios       # 네이티브 개발 빌드 (Xcode 필요)
pnpm --filter @starter/mobile android   # 네이티브 개발 빌드 (Android Studio 필요)
```

앱이 쓰는 네이티브 모듈이 모두 Expo Go(SDK 57)에 들어 있으므로 `dev`는 Expo Go에서도 돈다.
`ios`/`android` 스크립트는 먼저 네이티브 프로젝트를 prebuild한다. `ios/`와 `android/`는 git에서 제외된다.

## API URL

앱은 `EXPO_PUBLIC_API_URL`을 호출하고, 기본값은 `http://localhost:3000/rpc`다. 바꾸려면 `.env.example`을
`.env`로 복사해 고친 뒤 Metro를 다시 시작한다(값이 번들에 인라인된다).

| 앱이 도는 곳       | URL                                                    |
| ------------------ | ------------------------------------------------------ |
| iOS 시뮬레이터     | `http://localhost:3000/rpc` (기본값)                   |
| Android 에뮬레이터 | `http://10.0.2.2:3000/rpc`                             |
| 실기기             | `http://<내 컴퓨터의 LAN IP>:3000/rpc`, 같은 Wi-Fi에서 |

개발 빌드와 Expo Go에서는 평문 HTTP로도 된다. 릴리스 빌드에는 HTTPS URL이 필요하다.

## 세션 동작 방식

- `createApiClient({ clientKind: "native" })`로 만든 클라이언트 하나가 `src/lib/api.ts`에 있다. 액세스
  토큰을 메모리에 두고, 만료되면 한 번 갱신한 뒤 호출을 다시 시도한다(AUTH-16).
- 리프레시 토큰은 `expo-secure-store`를 통해 Keychain이나 Android Keystore에 둔다
  (`src/session/refresh-token-store.ts`). 키 하나에 최신 토큰만 두고(AUTH-19), 갱신이 거절되면 지운다(AUTH-17).
- 실행하면 루트 레이아웃이 저장된 토큰을 시도해 볼 때까지 스플래시 화면을 보인다. 서버에 닿지 않으면
  몇 초 뒤 로그아웃 상태로 열린다. 읽기에는 계정이 필요 없다.
- `useUser()`는 `useSyncExternalStore`로 사용자를 읽는다. 로그인한 사용자가 바뀌면 모든 쿼리를 다시
  불러오므로 `likedByMe`와 작성자 전용 동작이 늘 맞게 유지된다.

## 워크스페이스와 알림

- **워크스페이스**: 목록과 만들기, 워크스페이스 게시판, 워크스페이스에 글쓰기. 멤버 관리(사람 추가,
  역할)와 모더레이션 삭제는 웹과 데스크톱 앱에만 있다.
- **알림**: 읽음 처리가 되는 알림함과 헤더의 읽지 않음 배지. **지금은 모바일에 실시간 스트림이 없다.**
  배지와 알림함은 해당 화면에 포커스가 올 때 다시 불러온다. 실시간 전달을 하려면 앱이 포그라운드일 때
  `@starter/api-client`의 `watchNotifications`를, 백그라운드에서는 푸시 알림을 쓰면 된다.

## 구조

| 경로              | 내용                                                        |
| ----------------- | ----------------------------------------------------------- |
| `app/`            | 라우트: 글, 워크스페이스, 알림, 로그인, 회원가입            |
| `src/lib/`        | API 클라이언트, 오류 문구, 계약의 Zod 스키마를 쓰는 폼 검증 |
| `src/posts/`      | 글 폼, 좋아요 버튼, 댓글, 쿼리 캐시 도우미                  |
| `src/components/` | 버튼, 텍스트 필드, 로딩·오류 상태                           |

## 검사

```bash
pnpm --filter @starter/mobile typecheck
pnpm --filter @starter/mobile test      # 순수 TypeScript 모듈만 (테스트에 React Native 없음)
npx expo export --platform web --output-dir /tmp/mobile-export   # 번들링 확인, apps/mobile에서 실행
```

화면은 단위 테스트하지 않는다. 시뮬레이터나 기기에서 확인한다.
