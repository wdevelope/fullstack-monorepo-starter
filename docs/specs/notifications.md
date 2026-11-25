# 명세: 실시간 알림

- **상태:** 완료
- **ID 접두:** NOTI
- **코드 경로:** `packages/contracts/src/notifications.ts`, `apps/server/src/features/notifications/`, `apps/server/src/platform/notification-hub.ts`, `apps/server/src/features/posts/`, `apps/server/src/features/comments/`, `packages/api-client/src/notifications.ts`, `apps/web/src/lib/notifications.ts`, `apps/web/src/routes/notifications.tsx`, `apps/desktop/src/main/notification-forwarder.ts`, `apps/desktop/src/shared/notification-text.ts`, `apps/desktop/src/renderer/features/notifications/`, `apps/mobile/app/notifications.tsx`
- **승인:** 2026-11-05

## 목적

작성자가 자기 글에서 일어나는 일을 바로 안다. 누군가 내 글에 댓글을 달거나 좋아요를 누르면, 읽지 않은 개수가 있는 알림함에 알림이 쌓이고 열려 있는 내 클라이언트 모두가 Server-Sent Events로 실시간으로 받는다. 팬아웃이 프로세스 메모리가 아니라 PostgreSQL을 거치므로, API를 여러 인스턴스로 띄워도 전달된다.

## 규칙

1. 남의 글에 댓글이나 좋아요가 생기면 글 작성자에게 알림 하나를 만든다. 내 글에 내가 한 일로는 알림이 오지 않는다.
2. 좋아요 알림은 좋아요를 누른 사람과 글 한 쌍에 한 번만 온다. 취소했다가 다시 눌러도 같다. 부분 고유 인덱스가 이를 강제한다.
3. 알림은 댓글·좋아요와 같은 트랜잭션에서 쓴다. 그래서 둘이 어긋날 수 없다.
4. 트랜잭션이 커밋되면 서버가 PostgreSQL 채널에 알림 ID로 `NOTIFY`를 보낸다. 모든 서버 인스턴스가 `LISTEN`하고 있다가 받는 사람의 열린 스트림으로 밀어 준다. 스트림은 자기 사용자의 알림만 나른다.
5. 사용자는 자기 알림만 읽고 읽음 처리한다. 남의 알림 ID는 무시한다.
6. 스트림은 유효한 액세스 토큰이 있어야 열리고, 그 토큰이 만료되면 끝난다. 클라이언트는 새 토큰으로 다시 연결한다. 그래서 폐기된 세션은 토큰 수명(15분) 안에 알림을 그만 받는다.
7. 글이나 댓글을 지우면 그것을 가리키는 알림도 지워진다.
8. 알림에는 행동한 사람의 닉네임과 글 제목만 보이고, 댓글 내용은 보이지 않는다.

## 시나리오

| ID     | 전제 / 행동                                                               | 결과                                                                             |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| NOTI-1 | B가 A의 글에 댓글을 단다                                                  | A에게 B와 글 제목이 담긴 읽지 않은 `comment` 알림이 하나 생긴다                  |
| NOTI-2 | A가 자기 글에 댓글을 달거나 좋아요를 누른다                               | 알림이 없다                                                                      |
| NOTI-3 | B가 A의 글에 좋아요를 두 번 누르고, 취소했다가 다시 누른다                | A에게 그 글에 대한 B의 `like` 알림이 정확히 하나 있다                            |
| NOTI-4 | A가 알림 목록을 본다                                                      | 최신순이고 커서가 있으며, A의 알림만 나온다                                      |
| NOTI-5 | A가 알림 몇 개를 읽음 처리한 뒤 전부 읽음 처리한다                        | 읽지 않은 개수가 그만큼 줄어든다. 다른 사용자의 알림 ID는 아무것도 바꾸지 않는다 |
| NOTI-6 | A와 C가 스트림을 열어 두었고 B가 A의 글에 댓글을 단다                     | A의 스트림만 알림을 받고 C의 스트림은 아무것도 받지 않는다                       |
| NOTI-7 | A의 스트림은 한 서버 인스턴스에 열려 있고 B는 다른 인스턴스로 댓글을 단다 | A의 스트림이 알림을 받는다                                                       |
| NOTI-8 | 유효한 액세스 토큰 없이 스트림을 열거나, 열린 뒤 토큰이 만료된다          | 열 때 `UNAUTHORIZED`. 열린 스트림은 토큰 만료 때 끝난다                          |
| NOTI-9 | 알림이 있는 글을 지운다                                                   | 그 알림들이 사라진다                                                             |

## 계약

`notifications.list`(커서), `notifications.unreadCount`, `notifications.markRead`(`ids`는 선택. 없으면 전부), `notifications.stream`(SSE 위의 이벤트 이터레이터). 알림은 `{ id, type: "comment" | "like", post: { id, title }, actor: { id, nickname }, createdAt, readAt }`이다. 스트림은 서버가 그 사용자를 듣기 시작하면 먼저 `{ type: "ready", unreadCount }`를 한 번 보내고(다시 연결한 클라이언트가 놓친 것을 언제 다시 읽을지 알게), 새 알림마다 `{ type: "notification", notification, unreadCount }`를 보낸다.

## 데이터

- `notifications`: `recipient_id`, `actor_id`, `type`, `post_id`(연쇄 삭제), `comment_id`(null 허용, 연쇄 삭제), `created_at`, `read_at`. `(recipient_id, created_at DESC, id DESC)` 인덱스, `type = 'like'`인 행에 대한 `(post_id, actor_id)` 부분 고유 인덱스.
- PostgreSQL 채널 `notifications`, 페이로드 `{ id, recipientId }`.

## 변경 기록

- 2026-11-05: 처음 작성 (NOTI-1~9, 사용자 승인)
- 2026-11-25: 한국어 양식으로 옮김 (동작 변경 없음)
