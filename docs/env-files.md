# Environment files

Every `.env*` file in this repo, what it holds, who reads it, and whether it is
tracked in git. Two files are committed as templates (`*.env.example`); the
rest are local-only or CLI-generated artifacts.

> **The golden rule:** access is gated by genuine per-user login, not a shared
> secret. The server's `AUTH_USERS` roster (a Fly secret, format
> `"user:pass,user2:pass2"`) is the only source of truth for real credentials.
> Nothing in this repo — committed or local — holds a real password; local
> dev and the mobile demo use their own throwaway/placeholder credentials
> instead. See [Auth environment variables](#auth-environment-variables).

## Inventory

| File | Tracked? | Origin | Read by |
|---|---|---|---|
| `packages/client-react-native/.env.example` | ✅ tracked | hand-written template | humans — copy it to `.env` |
| `packages/client-react-native/.env` | 🚫 git-ignored | you (copy of the template) | Expo at Metro start → mobile app |
| `packages/client-react/.env.example` | ✅ tracked | hand-written template | humans — copy it to `.env.local` |
| `packages/client-react/.env.local` | 🚫 git-ignored | you (optional; not present by default) | Vite at dev/build → web app |
| `.env.local` (repo root) | 🚫 git-ignored | Vercel CLI (`vercel pull` / `vercel dev`) | Vercel CLI only — **not** app code |
| `.vercel/.env.production.local` | 🚫 git-ignored | Vercel CLI (`vercel pull`) | `vercel build --prod` in the deploy pipeline |

The whole `.vercel/` directory is a Vercel CLI artifact (project link + pulled
env); it is git-ignored via `.vercel/` and safe to delete — `vercel link` /
`vercel pull` regenerate it.

## Auth environment variables

| Var | Set where | Holds | Used by |
|---|---|---|---|
| `AUTH_SECRET` | Fly secret (by hand) | HMAC secret that signs session tokens | `AuthService` (`packages/server/src/auth/AuthService.ts`) |
| `AUTH_USERS` | Fly secret (by hand) | The real credential roster, `"user:pass,user2:pass2"` | `parseAuthUsers` (`packages/server/src/auth/loadUsers.ts`) — never committed; ask the team |
| `AUTH_TTL_MS` | Fly secret (by hand, optional) | Session-token lifetime in ms (defaults to 8h) | `AuthService` |
| `VITE_DEV_AUTH` | `packages/client-react/.env.local` (local only) | JSON `username -> password` map for **local simulator-mode dev only**, e.g. `{"demo":"localpass"}` | `AuthSimulator` via `buildBrowserPorts.ts`'s `parseDevAuth` |
| `EXPO_PUBLIC_DEMO_USER` / `EXPO_PUBLIC_DEMO_PASS` | `packages/client-react-native/.env` | The baked demo credential the mobile app auto-logs-in with (no login UI yet) | `nativeAuthConfig.ts` → `buildNativePorts.ts` |

None of these hold a real production credential in a committed file —
`VITE_DEV_AUTH`'s example and the RN `.env.example` both ship placeholder
values only (`demo`/`localpass`). **Ask the team for real credentials** to run
against the deployed server; never invent or commit one.

## The files, in detail

### `packages/client-react-native/.env.example` — the one tracked mobile template

The committed template for the mobile app's local env. It documents the keys
the app understands with empty/placeholder values, and is safe to publish (no
secrets). To use it:

```bash
cp packages/client-react-native/.env.example packages/client-react-native/.env
```

### `packages/client-react-native/.env` — mobile app, local

Per-developer, git-ignored. Keys:

- `EXPO_PUBLIC_DEMO_USER` / `EXPO_PUBLIC_DEMO_PASS` — the demo credential the
  app auto-logs-in with on every launch; both default to the public "demo"
  roster account when unset. Against a **real deployed server**, this pair
  must exist in its `AUTH_USERS` secret — ask the team for real credentials.
- `EXPO_PUBLIC_SERVER_URL` — optional; overrides the WS endpoint (defaults to
  `wss://rtc-clone-server.fly.dev`; set to `""` to force the in-process
  simulator).

Flow: `app.config.ts` reads these into `extra.demoUser`/`extra.demoPass` /
`extra.serverUrl` → `nativeAuthConfig.ts` supplies the credential to
`buildNativePorts.ts`, which logs in via `HttpAuthAdapter` (or `AuthSimulator`
in simulator mode) and feeds the resulting session token to `WsAdapter`.

> ⚠️ **`EXPO_PUBLIC_*` is inlined into the JS bundle when Metro starts** — it is
> not hot-reloaded. After editing this file you must **restart Metro**
> (`pnpm dev:ios`); an in-app reload against the running Metro keeps the old
> value. This is the most common "I updated the credential but it still won't
> connect" trap.

Full walkthrough (server side + client side): the RN package README,
[Live data, auto-login & the demo credential](../packages/client-react-native/README.md#live-data-auto-login--the-demo-credential-expo_public_demo_userexpo_public_demo_pass).

### `packages/client-react/.env.example` — the tracked web template

The committed template for the web app's local env. Documents `VITE_SERVER_URL`
(point the local dev server at a real deployed Fly server instead of the
in-browser simulator) and `VITE_DEV_AUTH` (seed credentials for
simulator-mode login, since simulator mode has no real server to authenticate
against). Safe to publish — placeholder values only. To use it:

```bash
cp packages/client-react/.env.example packages/client-react/.env.local
```

### `.env.local` (repo root) — a Vercel CLI artifact, not app config

Auto-created by the Vercel CLI (`vercel pull`, `vercel dev`, `vercel link`).
Its header literally reads `# Created by Vercel CLI`. It holds a single key:

- `VERCEL_OIDC_TOKEN` — a **short-lived** (~12h) OIDC JWT the CLI mints so local
  Vercel commands can federate access to Vercel-linked cloud resources.

**No application code in this repo reads it** — it is purely a Vercel CLI
convenience. It refreshes on the next `vercel pull`/`vercel dev`, and deleting
it is harmless. Don't hand-edit it and don't rely on it for anything in the
app.

### `.vercel/.env.production.local` — the deploy-time env snapshot

Written by `vercel pull` (Production target). It is the local mirror of what is
configured in the Vercel dashboard, consumed by `vercel build --prod` during a
deploy. Notable keys:

- `VITE_SERVER_URL` — `wss://rtc-clone-server.fly.dev` (empty → the web app runs
  the in-browser simulator, see [DEPLOY.md](./DEPLOY.md)).
- `TURBO_*`, `NX_DAEMON`, `VERCEL_*` — Turbo remote-cache config and Vercel
  system/git metadata injected by the platform; not something you set by hand.

That's the only app-relevant key — there is no client-side password or token
var anymore; login happens against the real server at runtime.

Because this file is a pull of dashboard state, the way to **change** these
values is in the Vercel dashboard (or `vercel env`), not by editing the file.
It is also the easiest way to *read* the current production values locally —
run `vercel pull` and inspect it (values are otherwise masked in `vercel env
ls`).

### `packages/client-react/.env.local` — web app, local (optional, not present by default)

Not committed and not created by default. Vite loads env files from the web
package root, so to run the **web** client against live data locally you would
create this file with `VITE_SERVER_URL` (see the `.env.example` above). Without
it, `src/app/buildBrowserPorts.ts` sees no `VITE_SERVER_URL` and takes the
simulator branch — which is why `pnpm dev` shows simulated prices out of the
box, with login handled by the in-process `AuthSimulator` seeded from
`VITE_DEV_AUTH`. (In production `VITE_SERVER_URL` comes from Vercel, not this
file; there is no client-side auth secret to set anywhere, local or
production — login always happens live against the server.)

## Related docs

- [DEPLOY.md](./DEPLOY.md) — Fly + Vercel setup, the deploy workflow, and
  credential management.
- [client-react-native README](../packages/client-react-native/README.md#live-data-auto-login--the-demo-credential-expo_public_demo_userexpo_public_demo_pass) —
  the mobile demo-credential walkthrough end to end.
- [`@rtc/server` README](../packages/server/README.md) — `POST /login`,
  `AuthService`, and the `AUTH_SECRET`/`AUTH_USERS`/`AUTH_TTL_MS` server-side
  env vars.
