# Community

- **Status**: Done
- **Code**: `packages/contracts/src/community.ts`, `apps/server/src/features/posts/`, `apps/server/src/features/comments/`

## Goal

A small board where signed-in users write posts, comment and like. Anyone can read. It is the sample feature that shows a vertical slice from contract to server to every client.

## Rules

1. Reading (list, detail) needs no sign-in. Writing, liking and commenting need a valid access token.
2. Only the author can edit or delete a post or a comment.
3. Lists are newest first and use keyset (cursor) pagination on `(created_at, id)`, so pages stay stable while new posts arrive.
4. Liking is idempotent: liking twice or unliking a post you did not like changes nothing. A primary key on `(post_id, user_id)` enforces it.
5. Deleting a post deletes its comments and likes.
6. Titles and bodies are trimmed and must not be empty after trimming.

## Scenarios

| ID     | Given / When                                          | Then                                                                       |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| COM-1  | Posts are listed with a limit                         | Newest first, `nextCursor` leads to the next page and is `null` at the end |
| COM-2  | The list is requested with a malformed cursor         | `BAD_REQUEST`                                                              |
| COM-3  | A post is opened                                      | Body, comments oldest first, like count, and `likedByMe` for the caller    |
| COM-4  | A post that does not exist is opened                  | `NOT_FOUND`                                                                |
| COM-5  | A post is created                                     | Requires sign-in; title and body are trimmed and validated                 |
| COM-6  | Someone other than the author edits or deletes a post | `FORBIDDEN`; a missing post is `NOT_FOUND`                                 |
| COM-7  | The author deletes a post                             | The post, its comments and its likes are gone                              |
| COM-8  | A user likes or unlikes a post twice                  | The second call changes nothing and the count stays correct                |
| COM-9  | A comment is added                                    | Requires sign-in; a missing post is `NOT_FOUND`                            |
| COM-10 | Someone other than the author deletes a comment       | `FORBIDDEN`                                                                |
| COM-11 | Posts are listed                                      | Each item has an excerpt, comment count and like count                     |

## Contract

`posts.list`, `posts.get`, `posts.create`, `posts.update`, `posts.delete`, `posts.like`, `posts.unlike`, `comments.create`, `comments.delete`. Typed errors: `NOT_FOUND` (404), `FORBIDDEN` (403).

## Data

- `posts`: `author_id`, `title`, `body`, `created_at`, `updated_at`; index on `(created_at DESC, id DESC)`.
- `comments`: `post_id` (cascade), `author_id`, `body`; index on `(post_id, created_at)`.
- `post_likes`: primary key `(post_id, user_id)`, cascades from posts.
