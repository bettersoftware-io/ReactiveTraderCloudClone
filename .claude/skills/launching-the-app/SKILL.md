---
name: launching-the-app
description: Use when starting, running or logging into any client in this repo (React, Solid, RN on iOS or Android, devtools, design prototypes) — the four data-source modes and their scripts, which env var picks simulator vs live, the demo accounts and passwords, the auth env formats, and the blank-screen fix.
---

# Launching the app

## Scripts

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages, then the tooling program (scripts, lint rules, root configs)
pnpm test        # vitest run in all packages
pnpm test:e2e    # Gherkin/Playwright e2e suites under tests/ against the web clients — the Playwright suites drive a production build (RTC_E2E_SERVE=dev puts them on the dev server), the Gherkin suites the dev server
pnpm dev         # Alias of `dev:react` — @rtc/client-react in simulator mode (no server); sign in with a committed demo account (see below)
pnpm dev:ws      # @rtc/server only — native WS + login on ws://localhost:4000 (tsx watch)
pnpm dev:watch   # Rebuild-watch every pure-TS library (domain, shared, ws-effects, motion-core, ui-contract, devtools-core, core-api, core-logic, core-contract, client-core-async, client-core-effect, web-boot) — run alongside a client to hot-rebuild lib edits
# Web clients — each has the same four data-source modes (bare = alias of :sim):
pnpm dev:react           # @rtc/client-react (Vite) → http://localhost:5173 — simulator mode (no server); alias of dev:react:sim
pnpm dev:react:ws:local  # connect to an already-running local `dev:ws` (ws://localhost:4000)
pnpm dev:react:ws:remote # connect to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:react:fs        # Full stack: start the WS server + @rtc/client-react together (ws://localhost:4000)
pnpm dev:solid           # @rtc/client-solid (Vite) → http://localhost:5473 — simulator mode; alias of dev:solid:sim
pnpm dev:solid:ws:local  # connect to an already-running local `dev:ws`
pnpm dev:solid:ws:remote # connect to the deployed server
pnpm dev:solid:fs        # Full stack: start the WS server + @rtc/client-solid together
pnpm dev:react:async     # @rtc/client-react on the async/await + AsyncIterable application core (sim mode)
pnpm dev:react:effect    # @rtc/client-react on the Effect-TS application core (sim mode)
pnpm dev:solid:async     # @rtc/client-solid on the async/await + AsyncIterable application core (sim mode)
pnpm dev:solid:effect    # @rtc/client-solid on the Effect-TS application core (sim mode)
# VITE_CORE_IMPL composes with any transport mode above, e.g. `VITE_CORE_IMPL=effect pnpm dev:react:ws:local`
# VITE_CORE_IMPL only sets the BUILD DEFAULT a fresh visitor lands on — a stored Preferences
# choice or a `?core=` URL parameter outranks it (load-time switch, since 2026-09-27); the
# console line `[core] booted <impl> from <url|stored|build|fallback>` says which won and why.
pnpm dev:proto   # @rtc/client-prototype only — the v2 design React port (Vite) → http://localhost:5273
pnpm dev:design:web     # standalone web design prototype HTML (v5), served by a zero-dep Node script → http://localhost:8899
pnpm dev:design:mobile  # same server, but the standalone mobile design prototype (mobile v1) → http://localhost:8899
# iOS (React Native) — the same four modes, via expo run:ios (bare = alias of :sim):
pnpm dev:ios             # @rtc/client-react-native on the iOS simulator — simulator mode (no server); alias of dev:ios:sim
pnpm dev:ios:ws:local    # connect to an already-running local `dev:ws` (ws://localhost:4000)
pnpm dev:ios:ws:remote   # connect to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:ios:fs          # Full stack: start the WS server + the RN app together (ws://localhost:4000)
# Android (React Native) — the same four modes, in an emulator (bare = alias of :sim):
pnpm dev:android             # @rtc/client-react-native in an Android emulator — simulator mode; alias of dev:android:sim
pnpm dev:android:ws:local    # connect to an already-running local `dev:ws`
pnpm dev:android:ws:remote   # connect to the deployed server
pnpm dev:android:fs          # Full stack: start the WS server + the RN app together
pnpm dev:devtools     # @rtc/devtools-app — the standalone inspector SPA (Vite), served same-origin at /devtools/
pnpm dev:devtools:ext # @rtc/devtools-extension — watch-build the unpacked MV3 bundle → packages/devtools-extension/dist (load via chrome://extensions → Load unpacked → RTC panel)
pnpm dev:devtools:relay # @rtc/devtools-relay — the standalone dev-machine WebSocket relay (ws://localhost:8790) bridging the browser inspector to the React Native client; open the panel at /devtools/?relay=ws://localhost:8790
pnpm check:core-bundle # Builds each web client once, asserts the eager set carries no application core and each core sits in exactly one lazy chunk, prints gzip sizes
pnpm clean       # Remove dist/ in all packages
```

## Data-source modes, logins and traps

**Client dev matrix.** All three clients (React, Solid, RN — on iOS and on Android) expose the **same four data-source modes** as an orthogonal script suffix, so the mode is always explicit in the command rather than hidden in a default:

| suffix | mode | server URL |
|--------|------|-----------|
| `:sim` (bare alias) | in-process / in-browser simulator | none |
| `:ws:local` | connect to an already-running local `dev:ws` (start it in another terminal) | `ws://localhost:4000` |
| `:ws:remote` | connect to the deployed server | `wss://rtc-clone-server.fly.dev` |
| `:fs` | full stack — starts the WS server **and** the client together | `ws://localhost:4000` |

Each client reads its source at composition time: the **web** clients from `VITE_SERVER_URL` (`packages/web-boot/src/buildBrowserPorts.ts`, handed the build values by `startWebClient`, which each client's `main.tsx` calls with `webBootEnvOf(import.meta.env)`), the **RN** client from `EXPO_PUBLIC_SERVER_URL` → `app.config.ts` `extra.serverUrl` → `buildNativePorts.ts`. Set → real `WsAdapter`; empty/unset → simulator. Names use *roles* (`:ws:local` / `:ws:remote`), never a vendor, so a host migration is a URL edit in the `:ws:remote` scripts, not a rename. Bare `dev:react` / `dev:solid` / `dev:ios` / `dev:android` alias `:sim`; bare `pnpm dev` aliases `dev:react`. The reconnecting `WsAdapter` tolerates the server coming up moments later, so `:fs`'s parallel start is fine. `dev:ws` and `dev:watch` are the reusable building blocks (server alone; library rebuild-watchers alone). Under `:ws:remote` a browser login other than the in-browser demo logins answers `403 origin_not_allowed` unless `http://localhost:5173,http://localhost:5473` are added to `RTC_ALLOWED_ORIGINS` on Fly, which admits a page served from any developer's localhost (`Origin` is browser-set, so a foreign site cannot claim it); the RN client sends no `Origin` and is unaffected.

The turbo-routed `*:fs` scripts rely on `VITE_SERVER_URL` / `EXPO_PUBLIC_SERVER_URL` (and, for the server, `AUTH_USERS` / `AUTH_SECRET` / `RTC_DEV_ACCOUNTS`) being declared on turbo's `dev` task `env` / `globalPassThroughEnv` (`dev:android:fs` runs the app through a separate `dev:android` task, which declares `EXPO_PUBLIC_SERVER_URL` itself and passes `JAVA_HOME` / `ANDROID_HOME` / `RTC_ANDROID_AVD` through; turbo's env mode is strict — an undeclared var would be stripped: a stripped `VITE_SERVER_URL` / `EXPO_PUBLIC_SERVER_URL` silently drops the client back to simulator mode, and a stripped `RTC_DEV_ACCOUNTS` leaves the server in `disabled` account mode — registered logins answer 503 — not in any simulator mode). **RN caveat:** `EXPO_PUBLIC_*` is baked into the JS bundle by Metro, so switching RN modes needs a Metro restart (the mode scripts each start their own Metro; an in-app reload against a stale Metro keeps the old value). The RN default when no env is set is the deployed endpoint — so a *distributed* build streams live out of the box; `dev:ios:sim` sets `EXPO_PUBLIC_SERVER_URL=` (empty) to force the offline branch locally. That env→`extra.serverUrl` wiring is guarded by `packages/client-react-native/app.config.test.ts` (it was silently dropped once, stranding the app in simulator mode).

**Demo accounts & auth env.** All local dev logins use a committed demo roster (`packages/domain/src/auth/roster.ts` — `astark` / `nromanoff` / `tchalla` / `demo`, all password `mcdc2026`; demo-only, safe to commit, rotate if it ever matters). Simulator mode (`pnpm dev` / `dev:react` / `dev:solid`) reads them from each client's own committed `.env.development` (`packages/client-react/.env.development` and `packages/client-solid/.env.development`, both `VITE_DEV_AUTH`, JSON `{"user":"pass"}` — Vite loads it dev-only, never in a production build) via the one `parseDevAuth` helper in `@rtc/web-boot`'s `buildBrowserPorts.ts`. A **production** build reads the same roster from each client's committed `.env.production` (`VITE_DEMO_AUTH`, same JSON format). With `VITE_SERVER_URL` also set that build is **hybrid** (hardening spec §8): credentials matching the demo roster are verified in the browser and run the simulators, anything else is posted to the server's `/login`, and a login that lands in the other mode stores its session plus `localStorage["rtc.dataSource"]` and reloads once. No `VITE_DEMO_AUTH` + a server URL is today's WS-real mode unchanged — which is every `dev:*:fs` / `dev:*:ws:*` and e2e flow, since `.env.development` carries no `VITE_DEMO_AUTH`. The console line `[data] composed <sim|live> from <reason>` says which rule won. Both web login screens list the accounts the page verifies in the browser as a click-to-fill hint (`startWebClient` calls `readDemoAccounts(env)` once per page → `page.demoAccounts` → `AppRoot`'s `demoAccounts` prop → `useDemoAccounts()` → `DemoAccountsHint`): the simulator roster in sim mode, the demo roster on a hybrid build, nothing on a plain live build. WS-real mode (`dev:*:fs` / `dev:*:ws:local` / `dev:*:ws:remote`; the deployed client is the hybrid described above, whose non-demo logins take this same path) authenticates against the **server's** `AUTH_USERS` instead — a *different* format, `"user:pass,user2:pass2"`, plus an `AUTH_SECRET`; the `dev:ws` / `dev:*:fs` scripts bake the same demo roster in so full-stack works out of the box too. Production is unaffected: Fly sets its own `AUTH_USERS` / `AUTH_SECRET` secrets, and these `dev:*` npm scripts never run there. **Registered accounts (B2a)** are an email + password checked by the **server** against its account store — Supabase in production (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`, server-only; no client, `@rtc/shared` or `@rtc/domain` ever holds either), an in-memory directory in dev (`RTC_DEV_ACCOUNTS=1`, baked into `dev:ws`, `dev:react:fs`, `dev:solid:fs`, `dev:ios:fs` and `dev:android:fs` but not `dev:*:ws:*`, seeded with `admin@` / `trader@` / `pending@` / `blocked@rtc.test`, password `Mcdc2026!desk`, code `00000000`, refused when `FLY_APP_NAME` or `RTC_DEPLOYED` — set by the server's container image — is set), and **disabled** otherwise — never a silent fallback to the dev store. The POST routes accept a browser only from `RTC_ALLOWED_ORIGINS` (localhost on a dev machine). Since B2b the login screen of both web clients offers Create account / Forgot password (the `accountAccess` machine) against those endpoints, but only on a page with a server URL (`pnpm dev:react:fs` / `dev:solid:fs` to try it; a simulator-only build shows no such links). `/login` sends an identifier containing `@` that way and anything else to the `AUTH_USERS` roster, which is why a roster username may not contain `@`. With accounts on, the server refuses to start on an `AUTH_SECRET` shorter than 32 characters, so the dev scripts use `dev-local-secret-public-by-design-never-deploy`. Flow, endpoints and limits: `docs/authentication.md` §7; rollout: `docs/DEPLOY.md` §4; the security model and the inventory of every setting and secret by location: `docs/security.md`.

**Blank screen on `pnpm dev`?** A stale Vite pre-bundle cache (e.g. after a lockfile change re-links a workspace dep) can silently break the render — the app crashes with the error swallowed and no Vite overlay, leaving a blank white page. Clear it and restart: `rm -rf packages/client-react/node_modules/.vite`.

**Future direction (not yet built).** `pnpm dev` is deliberately ambiguous today — "the default web client" — and currently resolves to React. The plan is to rename it to **`dev:web`** and have it select the client implementation (React vs Solid) from a feature flag, so `dev:web` boots whichever web client the flag points at while `dev:react` / `dev:solid` stay as the explicit per-implementation entry points. Until that lands, treat `pnpm dev` as "the React web client, simulator mode."

## Design prototypes and native dev builds

`dev:design:web` serves `docs/design/web/v5/standalone/Reactive Trader.html` (a self-contained design artifact, not app code) via `scripts/serve-design.mts`; `dev:design:mobile` serves the mobile counterpart under `docs/design/mobile/v1/standalone/`. The design prototypes are organized as `docs/design/web/{v1..v5}` (web iterations, v5 current) and `docs/design/mobile/v1` (mobile). v5's HTML and media are Git LFS-tracked (scoped to `docs/design/web/v5/**` in `.gitattributes`), so a fresh clone needs `git lfs pull` before `dev:design:web` can serve it. `dev:proto` runs its React re-implementation in `packages/client-prototype`. `dev:ios` delegates to the RN package's `ios` script (`expo run:ios`); it compiles the native dev client if missing, installs it on the booted simulator, and starts Metro — idempotent, so it's quick on later runs. The native `ios/` folder is gitignored and lives only where you run it (a removed worktree loses it), so run `dev:ios` once from your primary checkout to (re)create the dev build. `dev:android` is the Android counterpart (`scripts/runAndroidDev.ts` around `expo run:android`): it needs Java 17 (Homebrew's `openjdk@17` is picked up when `JAVA_HOME` is unset — Android Studio's bundled Java 25 cannot build), starts an emulator if none is running, and forwards the local server's port into it with `adb reverse` for `:ws:local` and `:fs`, because inside the emulator `localhost` is the emulator. The dev build and the EAS preview APK share one application id under different signing keys, so each script removes the other kind before installing. Details: the RN README, "Developing against Android".
