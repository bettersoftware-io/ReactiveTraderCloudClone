# Environment files

Every `.env*` file in this repo, what it holds, who reads it, and whether it is
tracked in git. Only **one** env file is committed (`*.env.example`); the rest
are local-only or CLI-generated artifacts.

> **The golden rule:** the WebSocket access token lives in several places that
> must all hold the **same** value — the Fly server's `WS_ACCESS_TOKEN` is the
> source of truth, and every client copy (`VITE_WS_TOKEN` for the web app,
> `EXPO_PUBLIC_WS_TOKEN` for the mobile app) must match it. Rotating the token
> means updating **all** of them. See [Rotating the token](#rotating-the-token).

## Inventory

| File | Tracked? | Origin | Read by |
|---|---|---|---|
| `packages/client-react-native/.env.example` | ✅ tracked | hand-written template | humans — copy it to `.env` |
| `packages/client-react-native/.env` | 🚫 git-ignored | you (copy of the template) | Expo at Metro start → mobile app |
| `.env.local` (repo root) | 🚫 git-ignored | Vercel CLI (`vercel pull` / `vercel dev`) | Vercel CLI only — **not** app code |
| `.vercel/.env.production.local` | 🚫 git-ignored | Vercel CLI (`vercel pull`) | `vercel build --prod` in the deploy pipeline |
| `packages/client-react/.env.local` | 🚫 git-ignored | you (optional; not present by default) | Vite at dev/build → web app |

The whole `.vercel/` directory is a Vercel CLI artifact (project link + pulled
env); it is git-ignored via `.vercel/` and safe to delete — `vercel link` /
`vercel pull` regenerate it.

## The files, in detail

### `packages/client-react-native/.env.example` — the one tracked template

The only committed env file. It documents the keys the mobile app understands
with empty/placeholder values, and is safe to publish (no secrets). To use it:

```bash
cp packages/client-react-native/.env.example packages/client-react-native/.env
```

### `packages/client-react-native/.env` — mobile app, local

Per-developer, git-ignored. Keys:

- `EXPO_PUBLIC_WS_TOKEN` — the WS access token; must equal the Fly
  `WS_ACCESS_TOKEN`.
- `EXPO_PUBLIC_SERVER_URL` — optional; overrides the WS endpoint (defaults to
  `wss://rtc-clone-server.fly.dev`; set to `""` to force the in-process
  simulator).

Flow: `app.config.ts` reads these into `extra.wsToken` / `extra.serverUrl` →
`src/app/buildNativePorts.ts` calls `buildWsUrl(url, token)`.

> ⚠️ **`EXPO_PUBLIC_*` is inlined into the JS bundle when Metro starts** — it is
> not hot-reloaded. After editing this file you must **restart Metro**
> (`pnpm dev:ios`); an in-app reload against the running Metro keeps the old
> value. This is the most common "I updated the token but it still won't
> connect" trap.

Full walkthrough (server side + client side): the RN package README,
[Live data, auto-login & the demo credential](../packages/client-react-native/README.md#live-data-auto-login--the-demo-credential-expo_public_demo_userexpo_public_demo_pass).

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
- `VITE_WS_TOKEN` — the web app's copy of the WS access token; must equal the
  Fly `WS_ACCESS_TOKEN`.
- `SITE_PASSWORD` — the Basic-Auth wall on the deployed site (`middleware.ts`).
- `TURBO_*`, `NX_DAEMON`, `VERCEL_*` — Turbo remote-cache config and Vercel
  system/git metadata injected by the platform; not something you set by hand.

Because this file is a pull of dashboard state, the way to **change** these
values is in the Vercel dashboard (or `vercel env`), not by editing the file.
It is also the easiest way to *read* the current production values locally —
run `vercel pull` and inspect it (values are otherwise masked in `vercel env
ls`).

### `packages/client-react/.env.local` — web app, local (optional, not present)

Not committed and not created by default. Vite loads env files from the web
package root, so to run the **web** client against live data locally you would
create this file with `VITE_SERVER_URL` + `VITE_WS_TOKEN`. Without it,
`src/app/buildBrowserPorts.ts` sees no `VITE_SERVER_URL` and takes the
simulator branch — which is why `pnpm dev` shows simulated prices out of the
box. (In production these two vars come from Vercel, not this file.)

## Rotating the token

The WS access token exists in up to four places. On rotation, set the **same**
new value everywhere it is used:

1. **Fly server** (source of truth): `fly secrets set WS_ACCESS_TOKEN=<new> -a rtc-clone-server`
2. **Web app (production):** `VITE_WS_TOKEN` in the Vercel dashboard → re-run the Deploy workflow.
3. **Mobile app (local):** `EXPO_PUBLIC_WS_TOKEN` in `packages/client-react-native/.env` → **restart Metro**.
4. **Web app (local), if you use it:** `VITE_WS_TOKEN` in `packages/client-react/.env.local`.

Forgetting step 3 is exactly how the mobile app silently stops connecting after
a web-side rotation: the server drops the stale `?access=` handshake and the app
just shows "Disconnected".

**Verify a candidate token against the live server** without printing it, using
the manual smoke script (needs `pnpm build` first):

```bash
EXPO_PUBLIC_WS_TOKEN=<candidate> pnpm --filter @rtc/client-react-native smoke:ws
```

`live tick: EURUSD …` means the server accepted it; an RxJS `TimeoutError` (or
`close 1006`) means it was rejected.

## Related docs

- [DEPLOY.md](./DEPLOY.md) — Fly + Vercel setup, the deploy workflow, and
  password/token rotation.
- [client-react-native README](../packages/client-react-native/README.md#live-data-auto-login--the-demo-credential-expo_public_demo_userexpo_public_demo_pass) —
  the mobile token walkthrough end to end.
