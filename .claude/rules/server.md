---
paths:
  - "apps/server/**"
---

# 서버 (`apps/server`, Hono + oRPC + Drizzle + PostgreSQL 16) 규칙

공통 규칙은 루트 `AGENTS.md`. 여기에는 서버에만 해당하는 것을 적는다.

## 작성 규칙

- **계층**: `features/<기능>/<기능>.router.ts`(계약 구현, 인증 미들웨어, 오류 코드 결정) → `<기능>.service.ts`(업무 규칙과 SQL). router는 SQL을 직접 쓰지 않고, service는 `ORPCError`를 던지지 않는다. service는 `null`·`false` 같은 값으로 "없음/권한 없음"을 돌려주고, router가 그것을 `errors.NOT_FOUND()`·`errors.FORBIDDEN()`로 바꾼다(`posts.router.ts` 선례).
- **인증**: 보호된 절차는 `.use(requireUser)`, 로그인하면 더 보이는 공개 읽기는 `.use(optionalUser)`(`platform/context.ts`). 호출자 ID는 `context.userId`에서만 얻는다.
- **요청 횟수 제한**: 로그인 없이 부르는 인증 절차는 핸들러 맨 앞에서 `checkRateLimit(context, "<절차>")`(`platform/rate-limit.ts`)를 부르고, 값이 오면 `errors.TOO_MANY_REQUESTS`를 던진다. 비밀번호 확인 같은 비싼 일보다 먼저 한다(RATE 규칙 2). 한도는 `RATE_LIMITS` 상수에 있다.
- **인가**: 워크스페이스 권한은 `features/workspaces/access.ts`의 SQL 조각(`canReadPost`, `canModeratePost`)을 같은 문의 `WHERE`·`EXISTS`에 넣는다. 먼저 읽고 JavaScript에서 비교하지 않는다(D7). 볼 수 없으면 `NOT_FOUND`.
- **입력 검증**: 계약의 Zod 스키마가 이미 검증했다. 핸들러에서 다시 검증하거나 손으로 변환하지 않는다. 계약에 없는 검증(커서 디코딩 등)만 하고, 실패하면 `BAD_REQUEST`.
- **트랜잭션**: 함께 성공하거나 실패해야 하는 쓰기(글·댓글·좋아요와 알림, 토큰 회전)는 `db.transaction`으로 묶는다. 트랜잭션 안팎에서 모두 쓰이는 함수는 `Executor`(`platform/db.ts`)를 받는다.
- **동시성·멱등**: "한 번만" 규칙은 애플리케이션 코드가 아니라 DB 제약으로 지킨다. 기본 키·(부분) 고유 인덱스 + `ON CONFLICT DO NOTHING`, 조건부 `UPDATE ... WHERE revoked_at IS NULL`처럼 쓴다.
- **시각**: `new Date()`를 직접 부르지 않고 `context.now()`를 쓴다. 테스트가 시간을 옮길 수 있게 하기 위해서다(AUTH-7 잠금 해제 등).
- **설정**: `process.env`는 `platform/config.ts`에서만 읽고 Zod로 검증한다. 새 환경 변수는 거기와 `.env.example`에 함께 더한다.
- **스키마**: 테이블·인덱스는 `src/db/schema.ts`에서 고치고 `pnpm --filter @starter/server db:generate`로 새 마이그레이션을 만든다. 생성된 SQL을 읽어 의도와 같은지 확인한다. 커밋된 `drizzle/*.sql`은 고치지 않는다.
- **새 기능 폴더**: `features/<기능>/`에 router·service·test를 두고 `src/router.ts`에 등록한다. 명세의 코드 경로에 폴더를 먼저 더한다.

## 테스트

- 통합 테스트는 실제 PostgreSQL에 HTTP로 붙는다. `test/test-app.ts`의 테스트 앱과 클라이언트(웹 쿠키 저장소 `CookieJar` 포함)를 쓰고, `beforeEach(() => t.reset())`로 테이블을 비운다. DB 모듈을 `vi.mock`하지 않는다.
- 파일은 한 DB를 공유해서 하나씩 돈다(`fileParallelism: false`).
- 테스트 클라이언트는 호출마다 다른 연결 IP를 쓰므로 요청 횟수 제한이 다른 테스트에 끼어들지 않는다. 같은 IP를 테스트하려면 `t.client({ kind, ip })`로 IP를 준다. E2E는 서버를 띄우기 전에 `test/reset-rate-limits.ts`로 카운터를 비운다.
- 권한 시나리오는 "다른 사용자"와 "멤버 아님"을 실제 계정 둘 이상으로 만든다.
- 테스트 하나: `pnpm --filter @starter/server test -- posts`

## 구조

- `src/main.ts`: 설정 읽기 → DB·알림 허브 생성 → `platform/http.ts`의 Hono 앱 → listen. 종료 신호에서 허브와 DB를 닫는다.
- `platform/http.ts`: `/health`, CORS(`CORS_ORIGINS`), `/rpc/*`에 oRPC 핸들러. 클라이언트 종류는 `x-client-kind` 헤더로 정한다.
- `platform/notification-hub.ts`: 인스턴스당 `LISTEN` 연결 하나. 받는 사람별로 열린 SSE 스트림에 나눠 준다(D9).
- `migrate-command.ts`: `pnpm --filter @starter/server db:migrate`.

## 함정

- 서버는 빌드 없이 Node가 `.ts`를 바로 실행한다(D10). import에 `.ts` 확장자가 필요하고 `enum`·`namespace`·생성자 매개변수 프로퍼티를 쓰면 실행 중에 깨진다.
- 타임스탬프는 밀리초 정밀도다. 커서가 `Date`와 정확히 오가야 하므로 정밀도를 바꾸지 않는다(D8).
- `pg_notify`는 트랜잭션 안에서 불러야 커밋 뒤에만 전달된다. 트랜잭션 밖으로 옮기지 않는다.
- 테스트 DB 이름에 `test`가 없으면 `test/database-url.ts`가 실행을 거부한다. 운영·개발 DB를 비우는 사고를 막는 장치이므로 우회하지 않는다.
