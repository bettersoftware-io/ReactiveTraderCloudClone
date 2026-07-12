# Phase 1 — Login Screen + Genuine Server-Side Authentication

**Date:** 2026-07-12
**Status:** Design approved (plan to follow)
**Scope decisions (locked):**

- Two phases. **Phase 1 (this spec):** a real login screen + genuine
  server-side authentication, replacing the Vercel HTTP Basic-Auth wall. Server
  state stays **shared** (one market everyone watches — deliberately kept, it's
  fun to watch an RFQ appear across browser instances).
- **Phase 2 (separate future spec):** per-user server state isolation.
- Auth transport: **HTTP `POST /login` on the Fly server + a stateless
  HMAC-signed token** (Approach A).
- Session lifetime: **stay logged in** — server issues a token with an `exp`;
  client stores it and auto-reconnects until it expires or the user logs out.
- The mid-session **Lock is made genuine** — unlocking re-validates the
  password server-side. **Logout** clears the token.
- The **real logged-in user's identity** drives the UI (lock screen, account
  menu). Trade attribution to the real user is Phase 2.
- **Credentials are not in the repo.** Only public profiles are committed;
  passwords live in a Fly secret and are shared out-of-band ("ask us"). Complex,
  non-guessable passwords. `POST /login` is rate-limited.
- **RN client:** keep it working via **auto-login** with a demo credential at
  startup; a native RN login screen is a fast-follow, not Phase 1.

---

## 1. Why

Two problems, one workstream:

1. The current gate is **Vercel edge HTTP Basic Auth** (`middleware.ts`, a single
   shared `SITE_PASSWORD`) — the browser's native credential dialog. Ugly, and
   not per-user.
2. The Fly WebSocket is gated by a **single shared static token**
   (`WS_ACCESS_TOKEN`, baked into the bundle as `VITE_WS_TOKEN`, passed as
   `?access=`). Also not per-user, and a baked secret.

Neither is genuine authentication — both are one shared secret for everyone.
Phase 1 replaces both with a proper in-app login and genuine server-side
credential validation, and establishes the identity seam that Phase 2's
per-user state will build on.

### Goals

- A HUD login screen visually consistent with the existing `LockScreen`.
- Genuine **server-side** validation of hardcoded users (real in production;
  simulated in-process locally, matching the app's simulator/wsReal duality).
- A session token that survives reload and is re-validated on every reconnect.
- Genuine Lock re-auth and a Logout.
- The logged-in user's real identity shown throughout.

### Non-goals (Phase 1)

- Per-user server state (positions/orders/blotter remain shared) — Phase 2.
- Real trade attribution (blotter still shows "You") — Phase 2.
- User self-registration, password reset, roles/permissions enforcement.
- A native RN login screen (RN auto-logs-in for now).

---

## 2. Current auth topology (what we replace)

| Layer | Mechanism | File |
|---|---|---|
| Vercel static site | HTTP Basic Auth, shared `SITE_PASSWORD`, 401 + `WWW-Authenticate` | `middleware.ts` |
| Fly WebSocket | shared static token in `?access=`, compared in `verifyClient` | `packages/server/src/auth.ts`, `index.ts` |
| Client token source | baked `VITE_WS_TOKEN` → `?access=` | `buildBrowserPorts.ts`, `wsUrl.ts` |

Both are removed/replaced by Phase 1.

---

## 3. Architecture

`AuthPort` becomes a first-class port with the usual two implementations,
selected by client mode exactly like every other port:

- **`AuthSimulator`** (`@rtc/domain`) — validates the hardcoded roster
  **in-process**, issues a mock token. Used in local **simulator mode**.
- **`HttpAuthAdapter`** (`@rtc/client-core`) — real `fetch POST /login`. Used
  in **WS-real mode**.

Package layout:

```
@rtc/shared        LoginRequestDto / SessionUserDto / LoginResponseDto (HTTP wire types)
@rtc/domain        AuthPort (interface), SessionUser (entity), AuthSimulator
@rtc/client-core   AuthPresenter (auth state), HttpAuthAdapter, SessionStore (port)
@rtc/react-bindings  useAuth() on the ViewModel seam
@rtc/client-react  LoginScreen, AuthGate, genuine LockScreen, LocalStorageSessionStore, Logout
@rtc/server        AuthService (roster + scrypt), token (HMAC), POST /login, verifyClient, rate-limit
(removed)          middleware.ts (Vercel Basic-Auth wall)
```

### Data flow — deployed (WS-real)

1. Load → `AuthPresenter` reads `SessionStore`. Valid stored token+profile →
   optimistically `authenticated` → App mounts → data hooks subscribe →
   `WsAdapter` connects with `?access=<token>`. If the server rejects the
   upgrade (expired/invalid) → "unauthorized" event → `logout()` → LoginScreen.
2. No token → **LoginScreen**. Submit → `HttpAuthAdapter` `POST /login` →
   `AuthService` validates → `{token, user}` → stored → `authenticated` → App
   mounts → WS connects.
3. **Lock** (account menu) → `locked` → LockScreen over the App; entering the
   password re-hits `/login` (username known) → unlock + refreshed token.
4. **Logout** → clear store → WS disconnects → LoginScreen.

### Data flow — local (simulator)

Identical UI; `AuthPort` = `AuthSimulator` (validates the same roster in-process
with dev-only credentials, issues a mock token). No WS, no network.

### Why auth naturally gates the data connection

The `WsAdapter` connects lazily at Rx subscribe time. Only the App subtree
subscribes to data hooks; the LoginScreen does not. So while unauthenticated,
nothing subscribes → no connection. Once the AuthGate mounts the App, hooks
subscribe and `WsAdapter` reads the token from `SessionStore` at connect time.
No special connection plumbing beyond the token read and the unauthorized-close
handler.

---

## 4. Server design (`@rtc/server`)

### AuthService (`src/auth/AuthService.ts`)

- Roster loaded at startup: public **profiles** from committed code merged with
  **passwords** from the `AUTH_USERS` secret. Each password is salted-scrypt
  hashed **in memory** at startup; plaintext is never retained or logged.
- `login(username, password) → { token, user } | null`: look up user, scrypt
  the input with the stored salt, `crypto.timingSafeEqual`, and on match issue a
  token and return the profile.
- `verifyToken(token) → { username } | null`.

### Token (`src/auth/token.ts`) — stateless, `node:crypto` only

- `sign(username, ttlMs)`: `payload = base64url({ u, exp })`,
  `sig = base64url(HMAC-SHA256(payload, AUTH_SECRET))`, token = `payload.sig`.
- `verify(token)`: split, recompute HMAC, `timingSafeEqual`, check `exp`.
- `AUTH_SECRET` from env (dev default locally; Fly secret in prod).

### HTTP + WS wiring (`src/index.ts`)

- **`POST /login`**: parse JSON body → `AuthService.login` → `200 {token, user}`
  or `401`. Extend CORS (currently GET-only) to allow `POST`, an `OPTIONS`
  preflight for `/login`, and the `Content-Type` request header.
- **Rate limit** `POST /login`: a small in-memory per-IP throttle (N/min, then
  `429`) to blunt brute-force / endpoint hammering. No dependency.
- **`verifyClient`** (replaces `auth.ts`'s shared-secret compare): extract
  `?access=` → `AuthService.verifyToken`. Invalid/expired → reject the upgrade
  (401 before a socket exists). `WS_ACCESS_TOKEN` is removed.

### Clean-arch placement

Token crypto + password hashing live in `@rtc/server` (they need `node:crypto`),
not `@rtc/domain` (rxjs-only). Domain owns the `AuthPort` interface and the pure
`AuthSimulator`. Same rationale as `WsAdapter` living outside domain.

---

## 5. Client design

### AuthPresenter (`@rtc/client-core`) — replaces the cosmetic SessionPresenter

State: `status: 'unauthenticated' | 'authenticating' | 'authenticated'`,
`locked: boolean`, `user: SessionUser | null`, `error: string | null`.

- Construct: read `SessionStore`; valid token+profile → `authenticated`
  (optimistic); else `unauthenticated`.
- `login(username, password)` → `AuthPort.login` → store `{token, user, exp}` +
  `authenticated`; on failure set `error`, stay `unauthenticated`.
- `unlock(password)` → `AuthPort.login(storedUsername, password)` →
  `locked = false` + refresh token; on failure `error`.
- `lock()` → `locked = true`. `logout()` → clear store → `unauthenticated`.

The existing `SessionPresenter` (lock/unlock + static `DEMO_USER`) is folded
into this. `DEMO_USER` becomes one roster entry rather than the only identity.

### Ports / adapters

- `AuthPort` (domain): `login(username, password): Observable<AuthOutcome>`
  where `AuthOutcome = { ok: true, token, user } | { ok: false, reason }`.
  - `AuthSimulator` (domain): in-process roster; **dev credentials injected at
    construction** (domain stays pure — `buildBrowserPorts` supplies them from a
    gitignored Vite env, so even dev creds need not be committed); mock token.
  - `HttpAuthAdapter` (client-core): `fetch(POST <httpBase>/login)`; HTTP base
    derived from `VITE_SERVER_URL` (ws→http). Maps `401`→`{ok:false}`,
    network/`429`→`{ok:false, reason}`.
- `SessionStore` (port): `read()/write({token,user,exp})/clear()`.
  - `LocalStorageSessionStore` (client-react adapter) + in-memory for
    tests/simulator.
- `WsAdapter`: reads the token from `SessionStore` at connect time; a rejected
  upgrade (immediate close / non-open) emits an **unauthorized** connection
  event → `AuthPresenter.logout()`.

### Seam

`useAuth()` on the ViewModel: `{ status, user, locked, error, login, unlock,
lock, logout }`. `LockScreen` and `AccountMenu` migrate from `useSession()` to
it (the old `useSession` is removed or thinly aliased during migration).

### UI (client-react) — all reuse `LockScreen.module.css`'s HUD panel

- **`<AuthGate>`** (inside `BootGate`): `unauthenticated` → `<LoginScreen>`;
  else render the App; `locked` → `<LockScreen>` overlay over the App.
- **`<LoginScreen>`**: the lock-screen panel (grid, `HudLogo` hex badge), title
  `REACTIVE TRADER OS · SIGN IN`, **username + password** fields where the
  biometric dots sit, an error line, `AUTHENTICATE ▸` submit → `login()`.
- **`<LockScreen>`** (now genuine): shows the known user's identity (as today)
  plus a **password** field; `AUTHENTICATE ▸` → `unlock(password)`.
- **`<AccountMenu>`**: add **Logout** (→ `logout()`); wire the existing Lock row
  to `lock()`.

The forms are plain inputs styled to match the HUD; no new visual language.

---

## 6. Users, credentials & security

- **Committed (public):** user **profiles** only — usernames + names/roles/desks
  (in a shared module reused by server roster and `AuthSimulator`).
- **Not committed:** passwords. The server reads them from the **`AUTH_USERS`**
  secret (Fly), hashes in memory at startup, timing-safe compares. Passwords are
  **complex and non-guessable** (e.g. `Rtc-Falcon-7719`-style), shared
  out-of-band. README says *"ask us for credentials."*
- **Local simulator mode:** separate simple **dev-only** credentials from a
  gitignored Vite `.env` (committed `.env.example`), injected into
  `AuthSimulator` by `buildBrowserPorts`. Local-only, no security concern —
  and since simulator auth runs entirely in the user's own browser (no server
  to attack), these creds carry no server-side risk.
- **Anti-abuse:** per-IP rate limit on `/login`; the WS upgrade rejects invalid
  tokens at the edge, so an unauthenticated visitor reaches no data stream and
  no simulator.
- **Documented tradeoffs (demo-grade):** token in `localStorage` + `?access=`
  (required because the browser WebSocket API can't send cookies/headers).
  Hardening — WS subprotocol / first-frame auth, httpOnly cookie — noted as
  future work, out of Phase 1 scope.

Roster (final names/passwords set out-of-band):

| username | profile |
|---|---|
| `astark` | Anthony Stark · AS · Senior FX Trader (today's `DEMO_USER`) |
| `nromanoff` | Natasha Romanoff · NR · Credit Desk |
| `tchalla` | T'Challa · TC · Head of Equities |
| `demo` | Demo Operator (the RN auto-login + easy manual login) |

---

## 7. Wire DTOs (`@rtc/shared`)

HTTP JSON for `/login` (not the WS `CLIENT_MSG`/`SERVER_MSG` protocol), in shared
for client+server reuse:

- `LoginRequestDto { username: string; password: string }`
- `SessionUserDto { name; initials; role; id; email; desk; clearance }`
- `LoginResponseDto { token: string; user: SessionUserDto; exp: number }`

---

## 8. Deployment & env migration

Mostly manual (the deploy PAT 403s on secret-set, so the user sets secrets by
hand):

- **Remove:** `middleware.ts` + `SITE_PASSWORD` (site assets become public — the
  login screen is the gate, as expected). `WS_ACCESS_TOKEN` (Fly),
  `VITE_WS_TOKEN` (Vercel build var), their `turbo.json` `build.env` allowlist
  entry, and the `deploy.yml` grep-guard.
- **Add (Fly secrets):** `AUTH_SECRET` (HMAC key) + `AUTH_USERS` (credentials).
- Client derives the `/login` URL from `VITE_SERVER_URL` (ws→https) — no new
  client build var.

---

## 9. RN handling

RN currently connects with the shared `EXPO_PUBLIC_WS_TOKEN`, which the new
server rejects. Phase 1: RN **auto-logs-in** at startup with the `demo`
credential via the shared `HttpAuthAdapter` → obtains a token → connects.
Genuine server auth, minimal change, RN stays working. A native RN login screen
is a fast-follow. Tradeoff: a demo credential is baked into the RN bundle
(extractable) — blunted by rate-limiting and it's only the demo account on
shared state. `EXPO_PUBLIC_WS_TOKEN` is replaced by the baked demo credential
(or, better, an `EXPO_PUBLIC_DEMO_USER/PASS` pair).

---

## 10. Testing

- **Server:** `AuthService` (login ok/fail, scrypt + timing-safe, rate-limit
  429); `token` (sign/verify/tamper/expire); `/login` route (200/401/429/CORS
  preflight); `verifyClient` (valid/invalid/expired).
- **Domain:** `AuthSimulator` (login ok/fail).
- **Client-core:** `AuthPresenter` (login/unlock/logout/resume-from-store/error
  paths); `SessionStore` adapter; `HttpAuthAdapter` (mock fetch 200/401/429);
  `WsAdapter` unauthorized→logout.
- **react-bindings:** `useAuth` seam.
- **client-react:** LoginScreen (submit, error), genuine LockScreen (password
  unlock), AuthGate (login vs app vs locked), AccountMenu logout — RTL contract
  specs + the react/ swap-trio.
- **e2e (Playwright):** app + real-stack smokes must **log in first** — update
  the harness to seed a token in `localStorage` (fast path) or drive the form
  (one coverage test).
- **Visual goldens:** a **new LoginScreen golden** + a **re-pinned LockScreen
  golden** (adds the password field), across the full theme matrix per the
  goldens recipe.

---

## 11. Phase-2 boundary (explicitly deferred)

Phase 2 threads the authenticated username (already produced by `verifyToken`)
through a **per-connection `ctx`**: per-user positions/orders/blotter keyed by
username; **shared hot** market-data streams (one price walk fanned out to all
connections, instead of a per-subscriber mutating walk); real trade attribution
instead of "You". Phase 1's signed token + `AuthPresenter` are exactly the seam
this needs.

---

## 12. Change map

**Added:** `@rtc/shared` DTOs · `@rtc/domain` `AuthPort` + `SessionUser` +
`AuthSimulator` · `@rtc/client-core` `AuthPresenter` + `HttpAuthAdapter` +
`SessionStore` port · `@rtc/client-react` `LoginScreen` + `AuthGate` +
`LocalStorageSessionStore` · `@rtc/server` `auth/AuthService` + `auth/token` +
`auth/users` + rate-limit + `/login` route.

**Modified:** `@rtc/server` `index.ts` (route + CORS + `verifyClient`), delete
`auth.ts`'s shared-secret path · `client-react` `AppRoot` (AuthGate), `LockScreen`
(genuine), `AccountMenu` (logout/lock), `buildBrowserPorts`/`wsUrl` (token from
store) · `react-bindings` `createViewModel` (`useAuth`) · RN `AppRoot`/ports
(auto-login) · `turbo.json` + `deploy.yml` (env) · e2e harness + visual goldens.

**Removed:** `middleware.ts`; `WS_ACCESS_TOKEN`/`VITE_WS_TOKEN`/`SITE_PASSWORD`
usage; the cosmetic-only `SessionPresenter` (folded into `AuthPresenter`).
