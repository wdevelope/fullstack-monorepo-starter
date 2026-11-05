# Auth

- **Status**: Done
- **Code**: `packages/contracts/src/auth.ts`, `apps/server/src/features/auth/`

## Goal

Email and password accounts for the web, desktop and mobile clients, with short-lived access tokens and rotating refresh tokens. The same API serves browsers (refresh token in an HttpOnly cookie) and native apps (refresh token in the body, kept in the OS keychain).

## Rules

1. Passwords are stored only as salted scrypt hashes and compared in constant time.
2. Access tokens are HS256 JWTs valid for 15 minutes. Their audience is the client kind (`web` or `native`), and a token is accepted only from the same client kind.
3. Refresh tokens are 256-bit random values. The database stores only their SHA-256 hash.
4. Every refresh revokes the presented token and issues a new one in the same family (rotation). Refresh tokens expire after 14 days.
5. Presenting a refresh token that was already rotated or revoked means it leaked: the whole family is revoked (reuse detection).
6. Five consecutive failed logins lock the account for 15 minutes. A successful login resets the counter.
7. Unknown email and wrong password return the same error and take the same time, so emails cannot be enumerated.
8. Web clients send `x-client-kind: web`. Only then does the server read or set the refresh cookie (`HttpOnly`, `SameSite=Strict`, path `/rpc/auth`). A cross-site form cannot set that header, so the cookie cannot be used for CSRF.

## Scenarios

| ID      | Given / When                                                         | Then                                                                                          |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AUTH-1  | A new user signs up with valid input                                 | The account is created and a session is returned (web: cookie, native: token in body)         |
| AUTH-2  | Sign-up uses an email that is already registered, in any letter case | `EMAIL_TAKEN`                                                                                 |
| AUTH-3  | Sign-up input is invalid (email format, password under 8, nickname)  | `BAD_REQUEST` from contract validation; email is trimmed and lowercased                       |
| AUTH-4  | A user logs in with the right password                               | A session is returned and the failure counter is reset                                        |
| AUTH-5  | Login uses a wrong password or an unknown email                      | `INVALID_CREDENTIALS` for both                                                                |
| AUTH-6  | The fifth consecutive login fails                                    | The account is locked: `ACCOUNT_LOCKED` with `retryAfterSeconds`, even for the right password |
| AUTH-7  | 15 minutes pass after a lock                                         | The right password works again                                                                |
| AUTH-8  | A valid refresh token is presented                                   | New access and refresh tokens are returned and the old refresh token is revoked               |
| AUTH-9  | An already rotated refresh token is presented again                  | `INVALID_REFRESH_TOKEN`, and the newest token of that family stops working too                |
| AUTH-10 | An expired or unknown refresh token is presented                     | `INVALID_REFRESH_TOKEN`                                                                       |
| AUTH-11 | A user logs out                                                      | The family is revoked, later refreshes fail, and the web cookie is cleared                    |
| AUTH-12 | A protected procedure is called without a valid access token         | `UNAUTHORIZED`                                                                                |
| AUTH-13 | An access token issued to one client kind is used by the other       | `UNAUTHORIZED`                                                                                |
| AUTH-14 | A password is hashed                                                 | The hash is salted scrypt and verifies only the original password                             |
| AUTH-15 | A refresh is sent with the cookie but without `x-client-kind: web`   | `INVALID_REFRESH_TOKEN`                                                                       |

## Contract

`auth.signup`, `auth.login`, `auth.refresh`, `auth.logout`, `auth.me`. Typed errors: `EMAIL_TAKEN` (409), `INVALID_CREDENTIALS` (401), `ACCOUNT_LOCKED` (423, `{ retryAfterSeconds }`), `INVALID_REFRESH_TOKEN` (401).

## Data

- `users`: unique `email`, `password_hash`, `failed_login_count`, `locked_until`.
- `refresh_tokens`: `family_id`, unique `token_hash`, `expires_at`, `revoked_at`, `replaced_by_id`. Rotation revokes with `UPDATE ... WHERE revoked_at IS NULL`, so two concurrent refreshes with the same token cannot both succeed.
