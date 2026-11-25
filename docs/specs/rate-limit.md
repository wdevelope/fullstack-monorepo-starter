# 명세: 요청 횟수 제한

- **상태:** 완료
- **ID 접두:** RATE
- **코드 경로:** `apps/server/src/platform/rate-limit.ts`, `apps/server/src/platform/http.ts`, `apps/server/src/platform/config.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/features/auth/`, `packages/contracts/src/auth.ts`, `apps/web/src/lib/errors.ts`, `apps/desktop/src/renderer/lib/errors.ts`, `apps/mobile/src/lib/errors.ts`
- **승인:** 2026-11-25

## 목적

인증 절차를 IP 단위로 제한해, 한 곳에서 여러 계정에 비밀번호를 대입하거나(credential stuffing) 가입·리프레시를 쏟아붓는 것을 막는다. 계정 단위 보호는 이미 계정 잠금(AUTH-6)이 하므로, 이 기능은 계정을 가리지 않는 IP 단위 보호를 더한다.

## 규칙

1. `auth.signup`, `auth.login`, `auth.refresh`는 클라이언트 IP마다, 절차마다 따로 고정 시간 창(window) 안의 요청 수를 센다. 한도는 다음과 같고, 서버 코드의 상수로 둔다.

   | 절차           | 한도(IP당)   |
   | -------------- | ------------ |
   | `auth.login`   | 1분에 10회   |
   | `auth.signup`  | 1시간에 10회 |
   | `auth.refresh` | 1분에 30회   |

   한도를 넘은 요청은 처리하지 않고 `TOO_MANY_REQUESTS`(429)와 `retryAfterSeconds`(창이 끝날 때까지 남은 초), `Retry-After` 헤더로 답한다. 글·댓글 쓰기 같은 다른 API는 제한하지 않는다.

2. 한도를 넘은 요청은 비밀번호를 확인하거나 계정 실패 횟수(AUTH-6)를 바꾸기 전에 거부한다. 맞는 비밀번호여도 거부한다.
3. 카운터는 PostgreSQL에 두어 모든 서버 인스턴스가 함께 센다(D9와 같은 이유). 증가와 판정은 SQL 문 하나(UPSERT)로 해서, 동시에 들어온 요청도 한도보다 많이 통과하지 못한다.
4. 창의 시작·끝은 서버 시계(`context.now()`)를 따른다.
5. 클라이언트 IP는 기본적으로 연결의 원격 주소다. 서버가 리버스 프록시 뒤에 있을 때만 설정(`TRUST_PROXY`)을 켜서 `X-Forwarded-For`를 쓴다. 꺼져 있으면 이 헤더를 무시한다(위조로 한도를 피하지 못하게).
6. 클라이언트(웹·데스크톱·모바일)는 이 오류를 "요청이 너무 많아요. N초 뒤에 다시 시도해 주세요."처럼 기다릴 시간과 함께 보인다.

## 시나리오

| ID      | 전제 / 행동                                                      | 결과                                                                                                    |
| ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| RATE-1  | 한 IP가 한 창 안에서 로그인을 한도만큼 보낸다                    | 모두 평소처럼 처리된다(성공 또는 `INVALID_CREDENTIALS`)                                                 |
| RATE-2  | 같은 창에서 한도를 넘는 로그인을 보낸다                          | `TOO_MANY_REQUESTS`(429), `retryAfterSeconds`와 `Retry-After`는 창이 끝날 때까지 남은 초                |
| RATE-3  | 한도를 넘은 로그인에 맞는 비밀번호를 보낸다                      | 거부되고, 그 계정의 실패 횟수·잠금 상태는 바뀌지 않는다                                                 |
| RATE-4  | 서버 시계로 창이 지난다                                          | 같은 IP의 로그인이 다시 처리된다                                                                        |
| RATE-5  | 한 IP가 한도를 다 쓴 뒤 다른 IP가 로그인한다                     | 다른 IP는 따로 세므로 처리된다                                                                          |
| RATE-6  | 한 IP가 로그인 한도를 다 쓴 뒤 같은 IP로 가입·리프레시를 한다    | 절차마다 따로 세므로 처리된다. 가입·리프레시도 각자의 한도를 넘으면 `TOO_MANY_REQUESTS`                 |
| RATE-7  | 한 IP가 한도보다 많은 로그인을 동시에 보낸다                     | 정확히 한도만큼만 처리되고 나머지는 `TOO_MANY_REQUESTS`                                                 |
| RATE-8  | 한 IP의 요청을 두 서버 인스턴스에 나눠 보낸다                    | 합쳐서 센다                                                                                             |
| RATE-9  | `TRUST_PROXY`가 꺼진 서버에 `X-Forwarded-For`를 바꿔 가며 보낸다 | 헤더를 무시하고 연결 주소로 세므로 한도를 피하지 못한다. 켜져 있으면 `X-Forwarded-For`의 첫 주소로 센다 |
| RATE-10 | 클라이언트가 `TOO_MANY_REQUESTS`를 받는다                        | "요청이 너무 많아요. N초 뒤에 다시 시도해 주세요." (1분 이상이면 분 단위)                               |

## 계약

- `auth.signup`, `auth.login`, `auth.refresh`에 타입 있는 오류 `TOO_MANY_REQUESTS`(429, `{ retryAfterSeconds }`)를 더한다. 오류 추가는 기존 클라이언트와 호환된다(모르는 코드는 일반 오류로 보인다).

## 데이터

- `rate_limit_buckets`: 기본 키 `key`(예: `login:203.0.113.7`), `window_started_at`(밀리초 정밀도), `count`. 창이 지난 행은 같은 UPSERT에서 새 창으로 다시 시작하므로 IP·절차 조합마다 한 행만 남는다.
- 새 마이그레이션 `0002_rate_limit`(테이블 추가만).

## 변경 기록

시나리오가 바뀔 때마다 한 줄씩 더한다(코드 경로만 바뀐 것은 적지 않는다).

- 2026-11-25: 처음 작성 (RATE-1~10, 사용자 승인)
