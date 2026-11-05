# Workspaces

- **Status**: Approved (2026-11-05)
- **Code**: `packages/contracts/src/workspaces.ts`, `apps/server/src/features/workspaces/`, workspace checks in `apps/server/src/features/posts/` and `apps/server/src/features/comments/`

## Goal

Teams get a private board. A user creates a workspace, adds people by email and gives them a role. Posts written in a workspace are visible only to its members, and admins can moderate them. It shows resource-level authorization of the kind B2B products need: every read and write checks who the caller is in that workspace, not just whether they are signed in.

## Rules

1. Roles are `owner`, `admin` and `member`. Each workspace has exactly one owner: the user who created it. A partial unique index enforces it.
2. Membership changes:
   - The owner adds members, changes anyone's role between `admin` and `member`, and removes anyone but themselves.
   - Admins add members (as `member`) and remove members whose role is `member`. They cannot change roles or touch other admins or the owner.
   - Any member except the owner can leave. The owner cannot leave or be removed; they delete the workspace instead.
3. Members are added by the email of an existing account. Sending invitations is out of scope.
4. Workspace content is visible only to members: the workspace itself, its post list, its posts, their comments and likes. Non-members get `NOT_FOUND`, never `FORBIDDEN`, so the existence of a workspace or post is not revealed.
5. Writing in a workspace (post, comment, like) requires membership. Editing a post stays author-only.
6. Deleting a post or a comment in a workspace is allowed to its author and to the workspace's admins and owner (moderation). On the public board only the author can delete.
7. Membership is checked inside the same SQL statement that reads or writes, so access ends the moment a member is removed and there is no check-then-act gap.
8. Removing a member keeps their posts and comments in the workspace. Deleting the workspace deletes its memberships, posts, comments and likes.
9. Posts without a workspace are the public board and behave exactly as in [community.md](community.md).

## Scenarios

| ID    | Given / When                                                               | Then                                                                                                                                   |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| WS-1  | A signed-in user creates a workspace                                       | They are its owner and it appears in their workspace list with role `owner`                                                            |
| WS-2  | A non-member opens a workspace, its post list or one of its posts          | `NOT_FOUND`                                                                                                                            |
| WS-3  | The owner or an admin adds an existing account by email                    | It becomes a `member`; unknown email is `USER_NOT_FOUND`, an existing member is `ALREADY_MEMBER`, a plain member trying is `FORBIDDEN` |
| WS-4  | The owner changes a member to `admin` and back                             | The role changes; an admin trying to change a role, or anyone changing the owner, is `FORBIDDEN`                                       |
| WS-5  | An admin removes a member, then tries to remove another admin or the owner | The member is removed; the other two are `FORBIDDEN`                                                                                   |
| WS-6  | A member leaves; the owner tries to leave                                  | The member is removed; the owner gets `FORBIDDEN`                                                                                      |
| WS-7  | A removed member opens a workspace post they could read before             | `NOT_FOUND`                                                                                                                            |
| WS-8  | A member writes a post in the workspace                                    | It is in the workspace list and not in the public list                                                                                 |
| WS-9  | An admin deletes another member's post and comment in the workspace        | Both are deleted; a plain member trying the same gets `FORBIDDEN`                                                                      |
| WS-10 | The owner deletes the workspace                                            | Memberships, posts, comments and likes are gone; anyone else trying gets `FORBIDDEN`                                                   |
| WS-11 | A non-member comments on or likes a workspace post                         | `NOT_FOUND`                                                                                                                            |

## Contract

- `workspaces.create`, `workspaces.list`, `workspaces.get` (with members), `workspaces.addMember`, `workspaces.updateMemberRole`, `workspaces.removeMember`, `workspaces.delete`.
- `posts.list` and `posts.create` take an optional `workspaceId`; post summaries and details include `workspaceId` (`null` on the public board).
- Typed errors: `NOT_FOUND` (404), `FORBIDDEN` (403), `USER_NOT_FOUND` (404), `ALREADY_MEMBER` (409).

## Data

- `workspaces`: `id`, `name`, `created_at`.
- `workspace_members`: primary key `(workspace_id, user_id)`, `role` (`owner` | `admin` | `member`, check constraint), `created_at`; partial unique index on `workspace_id` where `role = 'owner'`.
- `posts.workspace_id`: nullable, cascades from `workspaces`; index on `(workspace_id, created_at DESC, id DESC)`.
