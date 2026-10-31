# @rtc/server

The WebSocket server: a thin Node.js host that exposes the domain simulators to every client over declarative `@better-software/rx-ws-effects` effects (assembled by `buildEffects`), plus `/login`, the five registered-account endpoints (`/register`, `/resend-code`, `/confirm-email`, `/request-reset`, `/reset-password`), `/health`, `/health/accounts` and an `/mcp` endpoint.

| | |
|---|---|
| **Ring** | ③ Interface Adapters for the controllers/gateways (`src/effects/` + `src/socket/`'s `toSocket`) + ④ Frameworks & Drivers for the host wiring (`src/index.ts`, `node:http` + `ws`) -- per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/domain`, `@rtc/shared`, `@rtc/agent-tools`, `@better-software/rx-ws-effects`, `rxjs`, `ws`, `@anthropic-ai/sdk` (confined to `src/agent/`), `@modelcontextprotocol/sdk` (confined to `src/mcp/`) (`packages/server/package.json` `dependencies`) |
| **Consumed by** | `tests` only -- no other workspace package lists `@rtc/server` as a dependency (`grep -l '"@rtc/server"' packages/*/package.json tests/package.json`); the `tests` workspace spawns it as a child process via `pnpm --filter @rtc/server exec tsx src/index.ts` (`tests/fullstack/_orchestration.ts`), not an import |
| **Must never import** | `@rtc/client-react` -- enforced by the dependency-cruiser `server-not-client` rule (`from: ^packages/server/src`, `to: ^packages/client-react/`, `.dependency-cruiser.mts`, see [§6](../../docs/architecture/06-package-dependencies.md#6-package-dependencies)). It also never imports `@rtc/client-adapters` in practice (`grep -rln "@rtc/client-adapters" packages/server/src` returns nothing) and skips `@rtc/domain`'s `usecases/` entirely (`grep -rn "UseCase" packages/server/src` returns nothing) -- use cases are client-side orchestration; the server drives the domain simulators directly. |

## Folder map

| Path | What lives here |
|---|---|
| `src/effects/` | Declarative `WsEffect`s, one array per domain, assembled by `buildEffects(loops)` in `effects/index.ts` (the `allEffects` barrel plus the Jarvis effects), which `src/index.ts` (the composition root) hands to `combineEffects`. Inventory below. |
| `src/services/` | `serviceContainer.ts` -- `createServices()`, which builds the domain simulators/ports once at module load and packages them, plus the server-only `ThroughputService`, `UsageMeter` (today's Jarvis usage, for display) and `JarvisBudgetService` (each person's daily Jarvis spend on the house key, `jarvisBudget/`), as the `ServiceContainer` (aliased `Ctx` in `effects/context.ts`). |
| `src/agent/` | The Jarvis agent loops: `ScriptedAgentLoop` (the transport-neutral scripted brain from `@rtc/shared`) and `AnthropicAgentLoop` (the only place `@anthropic-ai/sdk` is imported), chosen per connection by `createJarvisLoops` in `agentLoop.ts`; also the `render_panel` and app-driving tools and the persona. |
| `src/mcp/` | The `/mcp` Streamable-HTTP endpoint: `buildJarvisMcpServer` exposes the `@rtc/agent-tools` registry to external MCP clients, `mcpHttpHandler` serves it behind the same token auth (the only place `@modelcontextprotocol/sdk` is imported). |
| `src/observability/` | `connectionLog.ts` -- the structured stdout line per WebSocket lifecycle event (see below). |
| `src/socket/` | The transport seam: `toSocket` adapts a raw `ws` `WebSocket` into `@better-software/rx-ws-effects`'s domain-blind `Socket` shape (`messages$`/`closed$`/`send`/`close`), `protocol.ts` holds the `WsMessage` envelope, and `FakeWs.testHelpers.ts` is the in-memory test double. Named `socket`, not `ws`, on purpose -- see the note below. |
| `src/auth/` | `AuthService` -- scrypt-hashes + `timingSafeEqual`-checks credentials from the `AUTH_USERS` roster and issues/verifies signed session tokens (`token.ts`; an account session carries the account id and access level too); `loadUsers.ts` parses the `"user:pass,user2:pass2"` `AUTH_USERS` format and refuses a username containing `@`; `rateLimit.ts` is the per-IP rate limiter every POST route runs through; `banList.ts` the in-app ban list. |
| `src/accounts/` | Registered accounts (B2a, [docs/authentication.md §7](../../docs/authentication.md#7-registered-accounts-b2a)): the `AccountDirectory` port and its three implementations (Supabase over plain `fetch`, in-memory for dev, disabled), `AccountService` (the policy), `resolveAccountsMode` (which store, and the startup refusals), `accountStatusCache` (the upgrade re-check) and `sessionUserFor`. The only code in the repo that knows Supabase exists. |
| `src/http/` | `loginHandler.ts` -- `authenticateLoginRequest` (the pure `/login` request handler: ban check → rate-limit → parse → `AuthService.login` for a roster username, `AccountService.login` for an email address) and `describeUpgrade` (the WebSocket-upgrade token check, reads `?access=` and calls `AuthService.verifyToken`); `upgradeGate.ts` (the whole upgrade decision, including the account status re-check); `accountHandlers.ts` + `accountLimits.ts` (the five account endpoints and their limiters); `postRouter.ts` (one preflight, ban check, body cap and error mapping for all six POST routes); `accountsHealth.ts` (`/health/accounts`). |
| `src/index.ts` | The composition root: HTTP server (`/health`, `/health/accounts`, the six POST routes, `/mcp`) + `WebSocketServer` (gated by `decideUpgrade`) + `combineEffects(...buildEffects(jarvisLoops))` + `createWsListener` + `httpServer.listen`. |

### `src/effects/` inventory

| File | Effects | Role |
|---|---|---|
| `fx.effects.ts` | `referenceData$`, `pricing$`, `blotter$`, `analytics$`, `executeTrade$`, `getPriceHistory$` (6) | FX: currency-pair reference data, price ticks, the trade blotter, position analytics, trade execution, and price history. |
| `credit.effects.ts` | `instruments$`, `dealers$`, `workflow$`, `createRfq$`, `cancelRfq$`, `quote$`, `pass$`, `accept$` (8) | Credit RFQ: instrument/dealer catalogs plus the full create → quote → accept/pass/cancel workflow lifecycle. |
| `equities.effects.ts` | `watchlist$`, `eqQuotes$`, `depth$`, `orders$`, `positions$`, `getCandles$`, `cancelOrder$`, `placeOrder$` (8) | Equities: watchlist, quotes, depth-of-book, the order and position books, candle history, and order placement/cancellation. |
| `ops.effects.ts` | `getThroughput$`, `setThroughput$` (2) | Ops: the throughput setpoint RPC pair. |
| `context.ts` | -- | Re-exports `ServiceContainer` as `Ctx`, the shared context type every effect above is generic over. |
| `jarvis.effects.ts` | -- | The `JARVIS_*` effects: an availability responder always, and the per-connection chat session (scripted or Anthropic, by the caller's `JarvisBrain` preference) when a loop set is present. |
| `opsJarvisUsage.effects.ts` | -- | Ops: today's Jarvis usage from `ctx.usageMeter` beside the house-wide spend and cap from `ctx.jarvisBudget`. |
| `index.ts` | -- | `allEffects` (FX + Credit + Ops + Equities, plus `opsJarvisUsageEffects`) and `buildEffects(loops)`, which appends the Jarvis effects; `src/index.ts` combines the result. |

(`*.effects.test.ts` siblings and `index.test.ts` are test files, omitted from the inventory above.)

**Why `socket`, not `ws`:** `packages/server/src/ws` was renamed to `packages/server/src/socket` in commit `c1b3b23b` ("fix(server): rename src/ws→src/socket so tsc-alias stops mangling the `ws` import") -- a local directory named the same as the `ws` npm dependency confused `tsc-alias`'s import rewriting into a broken self-import. The general rule this leaves behind: never name a local directory after one of the package's own runtime dependencies.

## Where to start reading

1. `src/index.ts` -- the composition root: build services, combine effects into one listener, build `AuthService` from `AUTH_SECRET`/`AUTH_USERS`/`AUTH_TTL_MS`, serve `/health` + `/login`, gate WS upgrades on `authorizeUpgrade`, wire each connection through `toSocket`, start listening.
2. `src/http/loginHandler.ts` -- `authenticateLoginRequest` (the `/login` request/response shape) and `authorizeUpgrade` (the WS-upgrade gate); both are pure functions, easy to test without a real HTTP server.
3. `src/auth/AuthService.ts` -- credential verification (scrypt + `timingSafeEqual`) and session-token issuance/verification (delegates signing to `token.ts`).
4. `src/effects/index.ts` -- `allEffects` and `buildEffects`; shows the domain effect arrays (and the Jarvis ones) before opening any single one.
5. `src/socket/toSocket.ts` -- the adapter that turns a `ws` `WebSocket` into the `Socket` shape `@better-software/rx-ws-effects` expects; the seam between this package's one framework dependency (`ws`) and the domain-blind effects framework.
6. `src/services/serviceContainer.ts` -- `createServices()`; ties each `@rtc/domain` simulator/port to its field on `Ctx`, the object every effect receives as its second argument.

## Auth

`POST /login` exchanges a username/password for a signed session token; the
WebSocket upgrade then requires that token as `?access=<token>`.

| Env var | Required | Holds |
|---|---|---|
| `AUTH_SECRET` | yes (Fly secret, set by hand) | HMAC secret that signs/verifies session tokens; at least 32 characters (trimmed) when accounts are enabled |
| `AUTH_USERS` | yes (Fly secret, set by hand) | The credential roster, `"user:pass,user2:pass2"` -- parsed by `loadUsers.ts`; a username may not contain `@` |
| `AUTH_TTL_MS` | no (defaults to 8h) | Session-token lifetime in milliseconds |
| `SUPABASE_URL` | with `SUPABASE_SECRET_KEY` (Fly secret) | The account store's project URL (`https://…`); turns on Supabase mode |
| `SUPABASE_SECRET_KEY` | with `SUPABASE_URL` (Fly secret) | A Supabase **secret** key (`sb_secret_…`); bypasses row-level security, server-only |
| `RTC_DEV_ACCOUNTS` | no; `1` in the `dev:ws` / `dev:*:fs` scripts | `1` turns on the in-memory dev account directory; refused when `FLY_APP_NAME` is set |
| `REGISTRATION_OPEN` | no (unset = open) | `true` or `false`; `false` makes `/register` answer `403 registration_closed`; any other value stops the server |
| `RTC_ALLOWED_ORIGINS` | yes on a deployed server (Fly secret); unset on a dev machine = localhost on any port | Comma-separated `scheme://host[:port]` origins; the server refuses to start without it when deployed, or with a malformed entry |
| `RTC_SIGNUPS_PER_HOUR` | no (default 25) | Positive integer: the hourly sign-up fuse; raise the Supabase project's email limit with it; anything else stops the server |
| `RTC_SIGNUPS_PER_DAY` | no (default 200) | Positive integer: the daily cap on new profiles; anything else stops the server |
| `PROBE_EMAIL_DOMAIN` | for `accounts:probe` only | Where the live probe's one confirmation email goes |

The POST routes (`/login` and the five account routes) accept a browser only
from an origin in `RTC_ALLOWED_ORIGINS` and only with `Content-Type:
application/json` (`403 origin_not_allowed` / `415 unsupported_media_type`,
no strike); a request with no `Origin` header, such as the mobile client's,
passes.

With neither `SUPABASE_URL` nor `RTC_DEV_ACCOUNTS=1` the account store is
**disabled**: registered logins answer `503` and the roster is untouched. The
full account flow, the six endpoints' answers, the startup refusals and the
dev accounts are in
[docs/authentication.md §7](../../docs/authentication.md#7-registered-accounts-b2a);
the rollout is [docs/DEPLOY.md §4](../../docs/DEPLOY.md#4-supabase-account-store).

| Route | What |
|---|---|
| `POST /login` | `{username, password}` → `200 {token, user, exp}`; an identifier containing `@` is checked against the account store |
| `POST /register` | `{email, displayName}` → `202 {status:"code_sent"}` (also for a known address) |
| `POST /resend-code` | `{email}` → `202 code_sent` |
| `POST /confirm-email` | `{email, code, password}` → `200 pending_approval` or `password_unset`; sets the password |
| `POST /request-reset` | `{email}` → `202 code_sent` |
| `POST /reset-password` | `{email, code, password}` → `200 password_changed` |
| `GET /health/accounts` | `{ok: true, directory: "up" \| "down" \| "in-memory" \| "disabled"}` |

`pnpm --filter @rtc/server accounts:probe` (`scripts/probe-accounts.ts`)
drives the Supabase adapter against a real project. It has not yet been run
against one, so until it prints `PASS` the adapter's agreement with
Supabase's real answers is unproven.

`/login` keys every per-caller rule on the platform's trusted client-IP header
(`src/http/clientIp.ts`, `Fly-Client-IP` by default, `RTC_TRUSTED_IP_HEADER`
to override -- never `X-Forwarded-For`, whose first hop the caller writes). It
answers `429 {"error":"banned"}` + `Retry-After` for an IP on the in-app ban
list (`src/auth/banList.ts`, checked before anything else), `429
{"error":"rate_limited"}` past 10 attempts/minute (`src/auth/rateLimit.ts`, an
evicting, bounded table), `413` for a body over 4 KiB (counted as received,
`src/http/readBody.ts`), `401` on bad credentials (hashed asynchronously, so a
login burst no longer stalls the live sockets), `200` with `{ token, user, exp
}` on success. A `401` or a `429` is a ban strike. The WS upgrade gate
(`src/http/upgradeGate.ts` -- ban list, then per-IP / total connection caps,
then the token) always rejects a missing, malformed, or expired token -- there
is no open-when-unset fallback.
Credentials are never committed to this repo; see
[docs/DEPLOY.md](../../docs/DEPLOY.md) and
[docs/env-files.md](../../docs/env-files.md) for how they're provisioned.

For the full end-to-end auth flow across both clients (login, resume-on-boot,
lock/unlock, the roster, and per-platform credential configuration), see
[docs/authentication.md](../../docs/authentication.md).

## Limits

Every per-caller bound lives in `src/config/limits.ts` (hardening spec §2.2 /
§9.2). The values are generous for one real client and tight for a flood:

| What | Constant | Default |
|---|---|---|
| Largest WebSocket frame, in bytes (`ws` closes that socket with 1009) — sized for a full Jarvis turn in a 3-byte script | `WS_MAX_PAYLOAD_BYTES` | 256 KiB |
| `jarvis.chat` message text (the clients' input stops here too) | `JARVIS_MESSAGE_MAX_CHARS` (`@rtc/domain`, enforced in `src/effects/jarvis.effects.ts`) | 4 000 chars |
| `jarvis.chat` history: entries, and characters per entry (the client shortens a longer entry before sending) | `JARVIS_HISTORY_MAX_ENTRIES`, `JARVIS_HISTORY_ENTRY_MAX_CHARS` (`@rtc/domain`) | 20, 2 000 chars |
| Live `stream()` inner streams per effect per connection | rx-ws-effects `StreamOptions.maxActive` | 64 |
| Distinct `keyedStream()` keys per effect per connection | rx-ws-effects `KeyedStreamOptions.maxKeys` | 128 |
| `rpc()` requests waiting on their handler per effect per connection (one over is nacked) | rx-ws-effects `RpcOptions.maxActive` | 64 |
| Shared blotter / equity order book / RFQ store | `@rtc/domain` simulator constructor arguments | 500 / 500 / 200, oldest evicted first |
| `/login` body (bytes received, `413` past it) | `LOGIN_MAX_BODY_BYTES` | 4 KiB |
| `/mcp` declared `Content-Length` (`413` past it; a chunked body is bounded only by the MCP SDK's own 4 MB limit, behind the Bearer check) | `MCP_MAX_BODY_BYTES` | 64 KiB |
| Live sockets, whole process / per client IP (`503` upgrade past it) | `MAX_CONNECTIONS_TOTAL` / `MAX_CONNECTIONS_PER_IP` | 200 / 8 |
| Inbound frames per socket: burst, refill, drops before the socket is closed (1008) | `INBOUND_BURST` / `INBOUND_REFILL_PER_SECOND` / `INBOUND_DROPS_BEFORE_CLOSE` | 100 / 25 per s / 100 |
| `/login` attempts per IP per window; distinct IPs the table holds | `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS`; rate limiter `maxKeys` | 10 / 60 s; 10 000 |
| Ban: weighted strikes in the window → ban length; table size | `BAN_STRIKES` / `BAN_STRIKE_WINDOW_MS` / `BAN_DURATION_MS` / `BAN_MAX_ENTRIES` | 10 in 10 min → 15 min; 10 000 |
| Account endpoint body (bytes received) | `ACCOUNT_MAX_BODY_BYTES` | 4 KiB |
| `/register` per IP | `REGISTER_RATE_LIMIT_MAX` / `_WINDOW_MS` | 5 per hour |
| `/resend-code`, `/request-reset` per IP, each | `SEND_CODE_RATE_LIMIT_MAX` / `_WINDOW_MS` | 5 per hour |
| `/confirm-email`, `/reset-password` per IP, each | `CODE_ENTRY_RATE_LIMIT_MAX` / `_WINDOW_MS` | 10 per 10 min |
| Code entry per address (confirm + reset share it); addresses held | `CODE_ENTRY_PER_ADDRESS_MAX` / `_WINDOW_MS`; `CODE_ENTRY_PER_ADDRESS_MAX_KEYS` | 5 per 15 min; 50 000 |
| Registrations per day, whole service (default of `RTC_SIGNUPS_PER_DAY`) | `MAX_REGISTRATIONS_PER_DAY` | 200 |
| Hourly fuses, whole server: sign-ups (default of `RTC_SIGNUPS_PER_HOUR`) / resends / resets; sum 55, under the project's 60 | `EMAIL_SENDS_PER_HOUR_MAX` / `RESENDS_PER_HOUR_MAX` / `RESETS_PER_HOUR_MAX` | 25 / 15 / 15 |
| A failed account login is held to at least | `LOGIN_FAILURE_FLOOR_MS` | 300 ms |
| Never-confirmed accounts deleted after; first purge run; interval; batch | `PURGE_UNCONFIRMED_AFTER_MS` / `PURGE_FIRST_RUN_DELAY_MS` / `PURGE_INTERVAL_MS` / `PURGE_BATCH` | 48 h; 1 min; 1 h; 100 |
| IPv6 /48 budget as a multiple of a caller's own; preflight cache | `WIDER_NETWORK_BUDGET_MULTIPLIER`; `CORS_MAX_AGE_SECONDS` | 4; 600 s |
| One account-store call | `ACCOUNT_DIRECTORY_TIMEOUT_MS` | 5 s |
| Upgrade status cache: lifetime; size | `ACCOUNT_STATUS_CACHE_TTL_MS` / `ACCOUNT_STATUS_CACHE_MAX_ENTRIES` | 60 s; 1 000 |
| Shortest `AUTH_SECRET` with accounts on | `AUTH_SECRET_MIN_LENGTH` | 32 |
| `/health/accounts` store read | `ACCOUNTS_HEALTH_CACHE_MS` | once per 60 s |

Every RPC and stream payload is validated at its parse seam
(`src/effects/guards.ts`): a malformed RPC is **nacked** (every client-adapters
adapter already handles a nack), a malformed subscribe frame is **dropped**,
and in both cases the connection's other effects keep serving. Before B1 a
malformed frame threw inside the effect and `combineEffects` replaced that
effect with `EMPTY` for the rest of the socket. The guards are never stricter
than what `packages/client-adapters/src/adapters/portFactory.ts` actually sends.

Strikes (`src/auth/banList.ts`): a failed login counts 1, a wrong confirmation
or reset code 1, a rate-limited attempt 2 (at `/login` or an account
endpoint), an oversized frame 3, a message flood 3. The ban table is in
memory — a redeploy clears it, which is fine for temporary bans.
`SET_THROUGHPUT` is per connection (`src/services/connectionScope.ts`), so one
login can no longer change it for everyone.

An accepted socket also has an `error` listener: `ws` emits `error` on the
server-side socket for a protocol violation (an oversized frame, bad UTF-8,
reserved bits), and with no listener Node turns that into a process crash
(spec finding S14). The listener logs the error code only.

## How it's used

The server has no simulator/real-transport split -- it *is* the thing WS-real clients connect to. Its own composition root builds the services once, combines the effects into one listener, wires up `/login` + the token-gated WS upgrade, and wires every incoming connection through it (`packages/server/src/index.ts`):

```ts
const services = createServices();
const jarvisLoops = createJarvisLoops(
  process.env,
  services,
  buildAnthropicLoop,
);
const listen = createWsListener(
  combineEffects(...buildEffects(jarvisLoops)),
  services,
);
const auth = new AuthService({
  secret: process.env.AUTH_SECRET ?? "",
  ttlMs: AUTH_TTL_MS,
  credentials: parseAuthUsers(process.env.AUTH_USERS),
});

// ...

const wss = new WebSocketServer({
  server: httpServer,
  // Reject unauthorized upgrades with 401 before a socket exists, so
  // listen() only ever runs for authorized clients. /health and /login stay
  // reachable (HTTP routes, not WS upgrades) for Fly health checks and login.
  verifyClient: (info: Parameters<VerifyClientCallbackSync>[0]): boolean => {
    const decision = describeUpgrade(info.req.url, auth);
    if (!decision.ok && decision.reason) {
      connectionLog.recordRejectedUpgrade(decision.reason);
    }
    return decision.ok;
  },
});

wss.on("connection", (ws) => {
  connectionLog.recordConnect();
  ws.on("close", () => connectionLog.recordDisconnect());
  listen(toSocket(ws));
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/login`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
});
```

The `tests` workspace boots this same file from source (`pnpm --filter @rtc/server exec tsx src/index.ts`, `tests/fullstack/_orchestration.ts`) and points a real client at it for full-stack browser/node smokes -- the only cross-package consumer of this package.

## Connection observability

`createConnectionLog` (`src/observability/connectionLog.ts`) emits one structured
stdout line per WebSocket lifecycle event, so live connection activity is visible
from the outside with no logging framework and no client inspector:

```
[ws] 2026-07-25T09:14:02.031Z connect       active=1 total=1
[ws] 2026-07-25T09:14:02.088Z upgrade-reject reason=no-token active=1
[ws] 2026-07-25T09:14:31.500Z disconnect    active=0 total=1
```

- **connect / disconnect** track `active` (open now) and `total` (accepted since
  start).
- **upgrade-reject** logs the [`describeUpgrade`](src/http/loginHandler.ts) reason
  — `no-token` (never signed in — the pre-login case), `invalid-token`
  (expired/bad), `no-url`, the edge guards `banned`, `too-many-connections`
  and `too-many-from-ip`, and `accounts-unavailable` when a registered
  account's store does not answer — and **never the token itself**. A registered
  account whose session has ended (blocked, unapproved, deleted, renamed, reset,
  or an old token) is not rejected: the handshake is accepted and the socket
  closed at once with `4401`, counted as `session-ended`.

Watch it live:

```bash
# local — start the dev server and its stdout streams to your terminal
pnpm dev:ws

# deployed — tail the Fly app's logs
fly logs -a rtc-clone-server
```

This is also the outside-in oracle for the RN client's connection behaviour: a
logged-out app that (correctly) opens no socket produces **no** `connect` and no
`upgrade-reject` lines until you sign in. A wider observability workstream
(Sentry, structured logging, metrics) is tracked as a follow-up in
[STATUS.md](../../docs/STATUS.md); this is the lightweight first step.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14.2 Adapter Tables Per App -- Server](../../docs/architecture/14-composition-and-wiring.md#142-adapter-tables-per-app)
- [§14.3 Boot Sequences -- Server](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences)
- [§7 The Declarative Effects Server](../../docs/architecture/07-communication-patterns.md#the-declarative-effects-server-rx-ws-effects) -- why the old `wsHandler.ts` switch was replaced, and the error-isolation this package relies on
- [§10.6 Declarative WS effects over a server `switch`](../../docs/architecture/10-key-design-decisions.md#10-key-design-decisions) -- the design decision record
- [`@better-software/rx-ws-effects` README](https://github.com/bettersoftware-io/rx-ws-effects#readme) -- the framework this package's `src/effects/` and `src/index.ts` are built on
