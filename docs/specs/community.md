# 명세: 커뮤니티 게시판

- **상태:** 완료
- **ID 접두:** COM
- **코드 경로:** `packages/contracts/src/community.ts`, `apps/server/src/features/posts/`, `apps/server/src/features/comments/`, `apps/server/src/platform/cursor.ts`, `apps/web/src/routes/post-list.tsx`, `apps/web/src/routes/post.tsx`, `apps/web/src/routes/post-editor.tsx`, `apps/desktop/src/renderer/features/posts/`, `apps/mobile/app/index.tsx`, `apps/mobile/app/posts/`, `apps/mobile/src/posts/`, `apps/mobile/src/lib/validation.ts`
- **승인:** 2026-11-05

## 목적

로그인한 사용자가 글을 쓰고, 댓글을 달고, 좋아요를 누르는 작은 게시판. 읽기는 누구나 할 수 있다. 계약에서 서버, 모든 클라이언트까지 한 번에 관통하는 수직 슬라이스의 예시다.

## 규칙

1. 공개 게시판 읽기(목록·상세)는 로그인이 필요 없다. 글쓰기·좋아요·댓글은 유효한 액세스 토큰이 필요하다. 워크스페이스 게시판은 멤버만 본다([workspaces.md](workspaces.md)).
2. 글은 작성자만 고친다. 글과 댓글은 작성자만 지운다. 단, 워크스페이스에서는 그 워크스페이스의 관리자와 소유자도 지울 수 있다(모더레이션, [workspaces.md](workspaces.md)).
3. 목록은 최신순이고 `(created_at, id)` 키셋(커서) 페이지네이션을 쓴다. 그래서 새 글이 들어와도 페이지가 밀리지 않는다.
4. 좋아요는 멱등이다. 두 번 누르거나 누르지 않은 글의 좋아요를 취소해도 아무것도 바뀌지 않는다. `(post_id, user_id)` 기본 키가 이를 강제한다.
5. 글을 지우면 그 글의 댓글과 좋아요도 지워진다.
6. 제목과 본문은 앞뒤 공백을 지운 뒤 비어 있으면 안 된다.

## 시나리오

| ID     | 전제 / 행동                                 | 결과                                                                         |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------- |
| COM-1  | 개수 제한을 주고 글 목록을 본다             | 최신순이고, `nextCursor`가 다음 페이지로 이어지며 마지막 페이지에서는 `null` |
| COM-2  | 형식이 틀린 커서로 목록을 요청한다          | `BAD_REQUEST`                                                                |
| COM-3  | 글을 연다                                   | 본문, 오래된 순 댓글, 좋아요 수, 호출자의 `likedByMe`                        |
| COM-4  | 없는 글을 연다                              | `NOT_FOUND`                                                                  |
| COM-5  | 글을 쓴다                                   | 로그인이 필요하고, 제목과 본문은 앞뒤 공백을 지운 뒤 검증한다                |
| COM-6  | 작성자가 아닌 사람이 글을 고치거나 지운다   | `FORBIDDEN`. 없는 글이면 `NOT_FOUND`                                         |
| COM-7  | 작성자가 글을 지운다                        | 글, 댓글, 좋아요가 모두 사라진다                                             |
| COM-8  | 같은 글에 좋아요나 좋아요 취소를 두 번 한다 | 두 번째 호출은 아무것도 바꾸지 않고 좋아요 수가 맞다                         |
| COM-9  | 댓글을 단다                                 | 로그인이 필요하고, 없는 글이면 `NOT_FOUND`                                   |
| COM-10 | 작성자가 아닌 사람이 댓글을 지운다          | `FORBIDDEN`                                                                  |
| COM-11 | 글 목록을 본다                              | 항목마다 본문 발췌, 댓글 수, 좋아요 수가 있다                                |

## 계약

`posts.list`, `posts.get`, `posts.create`, `posts.update`, `posts.delete`, `posts.like`, `posts.unlike`, `comments.create`, `comments.delete`. 타입 있는 오류: `NOT_FOUND`(404), `FORBIDDEN`(403).

## 데이터

- `posts`: `author_id`, `title`, `body`, `created_at`, `updated_at`. `(created_at DESC, id DESC)` 인덱스.
- `comments`: `post_id`(연쇄 삭제), `author_id`, `body`. `(post_id, created_at)` 인덱스.
- `post_likes`: 기본 키 `(post_id, user_id)`, 글이 지워지면 연쇄 삭제.

## 변경 기록

- 2026-11-05: 처음 작성 (COM-1~11, 사용자 승인)
- 2026-11-05: 워크스페이스 모더레이션에 맞춰 규칙 2를 고침 (COM-6·10, 사용자 승인)
- 2026-11-25: 한국어 양식으로 옮김 (동작 변경 없음)
