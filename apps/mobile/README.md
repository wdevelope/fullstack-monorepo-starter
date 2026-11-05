# @starter/mobile

The iOS and Android client: Expo Router, NativeWind (Tailwind v3) and TanStack Query on top of
`@starter/api-client`. It implements the community board from [`docs/specs/community.md`](../../docs/specs/community.md),
the native side of [`docs/specs/auth.md`](../../docs/specs/auth.md), workspace boards and the
notification inbox.

## Run it

Start the API first, from the repo root: copy `apps/server/.env.example` to `apps/server/.env`, then
`pnpm db:up`, `pnpm --filter @starter/server db:migrate` and `pnpm --filter @starter/server dev`. It
listens on port 3000 on all interfaces, so devices on your network can reach it.

```bash
pnpm --filter @starter/mobile dev       # Metro; press i (iOS simulator), a (Android emulator) or scan the QR code
pnpm --filter @starter/mobile ios       # native development build (needs Xcode)
pnpm --filter @starter/mobile android   # native development build (needs Android Studio)
```

`dev` also runs in Expo Go (SDK 57), since every native module the app uses ships with it. The
`ios`/`android` scripts prebuild the native projects first; `ios/` and `android/` are git-ignored.

## API URL

The app calls `EXPO_PUBLIC_API_URL`, default `http://localhost:3000/rpc`. Copy `.env.example` to
`.env` to change it, then restart Metro (the value is inlined into the bundle).

| Where the app runs | URL                                                           |
| ------------------ | ------------------------------------------------------------- |
| iOS simulator      | `http://localhost:3000/rpc` (default)                         |
| Android emulator   | `http://10.0.2.2:3000/rpc`                                    |
| Physical device    | `http://<your computer's LAN IP>:3000/rpc`, on the same Wi-Fi |

Plain HTTP is fine for development builds and Expo Go; release builds need an HTTPS URL.

## How the session works

- One client from `createApiClient({ clientKind: "native" })` lives in `src/lib/api.ts`. It keeps the
  access token in memory, refreshes it once when it expires and retries the call (AUTH-16).
- The refresh token sits in the Keychain or Android Keystore through `expo-secure-store`
  (`src/session/refresh-token-store.ts`). A rejected refresh deletes it (AUTH-17).
- On launch the root layout shows a splash screen until the stored token has been tried. If the
  server cannot be reached the app opens signed out after a few seconds; reading needs no account.
- `useUser()` reads the user with `useSyncExternalStore`. When the signed-in user changes, every
  query is refetched, so `likedByMe` and the author-only actions stay correct.

## Workspaces and notifications

- **Workspaces**: list and create, a workspace board, and new posts in a workspace. Member
  management (adding people, roles) and moderation deletes are in the web and desktop apps only.
- **Notifications**: an inbox with mark-read, and an unread badge in the header. There is **no live
  stream on mobile for now**: the badge and the inbox refetch when their screen gains focus. Live delivery would use `watchNotifications` from `@starter/api-client` while
  the app is in the foreground, and push notifications in the background.

## Layout

| Path              | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| `app/`            | Routes: posts, workspaces, notifications, sign in, sign up                  |
| `src/lib/`        | API client, error messages, form validation with the contract's Zod schemas |
| `src/posts/`      | Post form, like button, comments and query cache helpers                    |
| `src/components/` | Buttons, text fields, loading and error states                              |

## Checks

```bash
pnpm --filter @starter/mobile typecheck
pnpm --filter @starter/mobile test      # plain TypeScript modules only (no React Native in tests)
npx expo export --platform web --output-dir /tmp/mobile-export   # bundling check, from apps/mobile
```

Screens are not unit-tested. Check them on a simulator or device.
