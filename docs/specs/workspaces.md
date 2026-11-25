# 명세: 워크스페이스

- **상태:** 완료
- **ID 접두:** WS
- **코드 경로:** `packages/contracts/src/workspaces.ts`, `apps/server/src/features/workspaces/`, `apps/server/src/features/posts/`, `apps/server/src/features/comments/`, `apps/web/src/routes/workspaces.tsx`, `apps/desktop/src/renderer/features/workspaces/`, `apps/mobile/app/workspaces/`
- **승인:** 2026-11-05

## 목적

팀이 쓰는 비공개 게시판. 사용자가 워크스페이스를 만들고, 이메일로 사람을 더하고, 역할을 준다. 워크스페이스에 쓴 글은 멤버만 보고, 관리자는 글을 정리(모더레이션)할 수 있다. B2B 제품에 필요한 리소스 단위 인가를 보여 준다. 모든 읽기와 쓰기가 로그인 여부가 아니라 "그 워크스페이스에서 호출자가 누구인지"를 확인한다.

## 규칙

1. 역할은 `owner`, `admin`, `member`다. 워크스페이스마다 소유자는 정확히 한 명이고, 워크스페이스를 만든 사용자다. 부분 고유 인덱스가 이를 강제한다.
2. 멤버 변경:
   - 소유자는 멤버를 더하고, 누구든 역할을 `admin`과 `member` 사이에서 바꾸고, 자신을 뺀 누구든 내보낸다.
   - 관리자는 멤버를 (`member`로) 더하고, 역할이 `member`인 사람을 내보낸다. 역할을 바꾸거나 다른 관리자·소유자를 건드리지 못한다.
   - 소유자가 아닌 멤버는 누구든 나갈 수 있다. 소유자는 나가거나 내보내지지 않는다. 대신 워크스페이스를 지운다.
3. 멤버는 이미 있는 계정의 이메일로 더한다. 초대 메일 발송은 범위 밖이다.
4. 워크스페이스 내용(워크스페이스 자체, 글 목록, 글, 댓글, 좋아요)은 멤버만 본다. 멤버가 아니면 `FORBIDDEN`이 아니라 `NOT_FOUND`를 받는다. 그래서 워크스페이스나 글이 있는지조차 드러나지 않는다.
5. 워크스페이스에 쓰기(글·댓글·좋아요)는 멤버여야 한다. 글 수정은 여전히 작성자만 한다.
6. 워크스페이스의 글이나 댓글은 작성자와 그 워크스페이스의 관리자·소유자가 지울 수 있다(모더레이션). 공개 게시판에서는 작성자만 지운다.
7. 멤버 여부는 읽고 쓰는 바로 그 SQL 문 안에서 확인한다. 그래서 멤버를 내보내는 순간 접근이 끝나고, 확인과 실행 사이의 틈(check-then-act)이 없다.
8. 멤버를 내보내도 그 사람이 쓴 글과 댓글은 남는다. 워크스페이스를 지우면 멤버십, 글, 댓글, 좋아요가 함께 지워진다.
9. 워크스페이스가 없는 글은 공개 게시판이고 [community.md](community.md)와 똑같이 동작한다.

## 시나리오

| ID    | 전제 / 행동                                                        | 결과                                                                                                            |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| WS-1  | 로그인한 사용자가 워크스페이스를 만든다                            | 그 사용자가 소유자가 되고, 워크스페이스 목록에 역할 `owner`로 나온다                                            |
| WS-2  | 멤버가 아닌 사람이 워크스페이스, 그 글 목록, 그 글을 연다          | `NOT_FOUND`                                                                                                     |
| WS-3  | 소유자나 관리자가 이미 있는 계정을 이메일로 더한다                 | `member`가 된다. 없는 이메일은 `USER_NOT_FOUND`, 이미 멤버면 `ALREADY_MEMBER`, 일반 멤버가 시도하면 `FORBIDDEN` |
| WS-4  | 소유자가 멤버를 `admin`으로 바꿨다가 되돌린다                      | 역할이 바뀐다. 관리자가 역할을 바꾸거나 누구든 소유자의 역할을 바꾸면 `FORBIDDEN`                               |
| WS-5  | 관리자가 멤버를 내보낸 뒤, 다른 관리자와 소유자를 내보내려 한다    | 멤버는 나가고, 나머지 둘은 `FORBIDDEN`                                                                          |
| WS-6  | 멤버가 나가고, 소유자가 나가려 한다                                | 멤버는 나가고, 소유자는 `FORBIDDEN`                                                                             |
| WS-7  | 내보내진 멤버가 전에 읽을 수 있던 워크스페이스 글을 연다           | `NOT_FOUND`                                                                                                     |
| WS-8  | 멤버가 워크스페이스에 글을 쓴다                                    | 워크스페이스 목록에는 있고 공개 목록에는 없다                                                                   |
| WS-9  | 관리자가 워크스페이스에서 다른 멤버의 글과 댓글을 지운다           | 둘 다 지워진다. 일반 멤버가 같은 일을 하면 `FORBIDDEN`                                                          |
| WS-10 | 소유자가 워크스페이스를 지운다                                     | 멤버십, 글, 댓글, 좋아요가 사라진다. 다른 사람이 시도하면 `FORBIDDEN`                                           |
| WS-11 | 멤버가 아닌 사람이 워크스페이스 글에 댓글을 달거나 좋아요를 누른다 | `NOT_FOUND`                                                                                                     |

## 계약

- `workspaces.create`, `workspaces.list`, `workspaces.get`(멤버 포함), `workspaces.addMember`, `workspaces.updateMemberRole`, `workspaces.removeMember`, `workspaces.delete`.
- `posts.list`와 `posts.create`는 선택 값 `workspaceId`를 받는다. 글 요약과 상세에 `workspaceId`가 있다(공개 게시판은 `null`).
- 타입 있는 오류: `NOT_FOUND`(404), `FORBIDDEN`(403), `USER_NOT_FOUND`(404), `ALREADY_MEMBER`(409).

## 데이터

- `workspaces`: `id`, `name`, `created_at`.
- `workspace_members`: 기본 키 `(workspace_id, user_id)`, `role`(`owner` | `admin` | `member`, check 제약), `created_at`. `role = 'owner'`인 행에 대한 `workspace_id` 부분 고유 인덱스.
- `posts.workspace_id`: null 허용, `workspaces`가 지워지면 연쇄 삭제. `(workspace_id, created_at DESC, id DESC)` 인덱스.

## 변경 기록

- 2026-11-05: 처음 작성 (WS-1~11, 사용자 승인)
- 2026-11-25: 한국어 양식으로 옮김 (동작 변경 없음)
