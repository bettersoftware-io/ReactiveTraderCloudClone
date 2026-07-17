# @rtc/server

The WebSocket server: a thin Node.js host that exposes the domain simulators to every client over 24 declarative `@rtc/ws-effects` effects.

| | |
|---|---|
| **Ring** | ③ Interface Adapters for the controllers/gateways (`src/effects/` + `src/socket/`'s `toSocket`) + ④ Frameworks & Drivers for the host wiring (`src/index.ts`, `node:http` + `ws`) -- per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/domain`, `@rtc/shared`, `@rtc/ws-effects`, `rxjs`, `ws` (`packages/server/package.json` `dependencies`) |
| **Consumed by** | `tests` only -- no other workspace package lists `@rtc/server` as a dependency (`grep -rln "@rtc/server" packages/ tests/`, excluding self-references inside `packages/server/` itself, returns only `packages/{ws-effects,domain,shared}/README.md`, `tests/README.md`, and `tests/package.json`/`tests/fullstack/_orchestration.ts`, which spawns it as a child process via `pnpm --filter @rtc/server exec tsx src/index.ts`, not an import) |
| **Must never import** | `@rtc/client-react` -- enforced by the dependency-cruiser `server-not-client` rule (`from: ^packages/server/src`, `to: ^packages/client-react/`, `.dependency-cruiser.cjs`, see [§6](../../docs/architecture/06-package-dependencies.md#6-package-dependencies)). It also never imports `@rtc/client-core` in practice (`grep -rln "@rtc/client-core" packages/server/src` returns nothing) and skips `@rtc/domain`'s `usecases/` entirely (`grep -rn "UseCase" packages/server/src` returns nothing) -- use cases are client-side orchestration; the server drives the domain simulators directly. |

## Folder map

| Path | What lives here |
|---|---|
| `src/effects/` | 24 declarative `WsEffect`s, one array per domain, merged by `effects/index.ts` into the `allEffects` barrel, which `src/index.ts` (the composition root) hands to `combineEffects`. Inventory below. |
| `src/services/` | `serviceContainer.ts` -- `createServices()`, which builds the eleven domain simulators/ports once at module load and packages them, plus the server-only `ThroughputService`, as the twelve-field `ServiceContainer` (aliased `Ctx` in `effects/context.ts`). |
| `src/socket/` | The transport seam: `toSocket` adapts a raw `ws` `WebSocket` into `@rtc/ws-effects`'s domain-blind `Socket` shape (`messages$`/`closed$`/`send`), `protocol.ts` holds the `WsMessage` envelope, and `FakeWs.testHelpers.ts` is the in-memory test double. Named `socket`, not `ws`, on purpose -- see the note below. |
| `src/auth/` | `AuthService` -- scrypt-hashes + `timingSafeEqual`-checks credentials from the `AUTH_USERS` roster and issues/verifies signed session tokens (`token.ts`); `loadUsers.ts` parses the `"user:pass,user2:pass2"` `AUTH_USERS` format; `rateLimit.ts` is the per-IP rate limiter `/login` runs through. |
| `src/http/` | `loginHandler.ts` -- `handleLogin` (the pure `/login` request handler: rate-limit → parse → `AuthService.login`) and `authorizeUpgrade` (the WebSocket-upgrade token check, reads `?access=` and calls `AuthService.verifyToken`), both run before `src/index.ts` ever creates a socket. |
| `src/index.ts` | The composition root: HTTP server (`/health`, `/login`) + `WebSocketServer` (gated by `authorizeUpgrade`) + `combineEffects(...allEffects)` + `createWsListener` + `httpServer.listen`. |

### `src/effects/` inventory

| File | Effects | Role |
|---|---|---|
| `fx.effects.ts` | `referenceData$`, `pricing$`, `blotter$`, `analytics$`, `executeTrade$`, `getPriceHistory$` (6) | FX: currency-pair reference data, price ticks, the trade blotter, position analytics, trade execution, and price history. |
| `credit.effects.ts` | `instruments$`, `dealers$`, `workflow$`, `createRfq$`, `cancelRfq$`, `quote$`, `pass$`, `accept$` (8) | Credit RFQ: instrument/dealer catalogs plus the full create → quote → accept/pass/cancel workflow lifecycle. |
| `equities.effects.ts` | `watchlist$`, `eqQuotes$`, `depth$`, `orders$`, `positions$`, `getCandles$`, `cancelOrder$`, `placeOrder$` (8) | Equities: watchlist, quotes, depth-of-book, the order and position books, candle history, and order placement/cancellation. |
| `admin.effects.ts` | `getThroughput$`, `setThroughput$` (2) | Admin: the throughput setpoint RPC pair. |
| `context.ts` | -- | Re-exports `ServiceContainer` as `Ctx`, the shared context type every effect above is generic over. |
| `index.ts` | -- | The `allEffects` barrel: concatenates the four domain arrays above into the 24 effects `src/index.ts` combines. |

(`*.effects.test.ts` siblings and `index.test.ts` are test files, omitted from the inventory above.)

**Why `socket`, not `ws`:** `packages/server/src/ws` was renamed to `packages/server/src/socket` in commit `c1b3b23b` ("fix(server): rename src/ws→src/socket so tsc-alias stops mangling the `ws` import") -- a local directory named the same as the `ws` npm dependency confused `tsc-alias`'s import rewriting into a broken self-import. The general rule this leaves behind: never name a local directory after one of the package's own runtime dependencies.

## Where to start reading

1. `src/index.ts` -- the composition root: build services, combine effects into one listener, build `AuthService` from `AUTH_SECRET`/`AUTH_USERS`/`AUTH_TTL_MS`, serve `/health` + `/login`, gate WS upgrades on `authorizeUpgrade`, wire each connection through `toSocket`, start listening.
2. `src/http/loginHandler.ts` -- `handleLogin` (the `/login` request/response shape) and `authorizeUpgrade` (the WS-upgrade gate); both are pure functions, easy to test without a real HTTP server.
3. `src/auth/AuthService.ts` -- credential verification (scrypt + `timingSafeEqual`) and session-token issuance/verification (delegates signing to `token.ts`).
4. `src/effects/index.ts` -- the `allEffects` barrel; shows the four domain effect arrays before opening any single one.
5. `src/socket/toSocket.ts` -- the adapter that turns a `ws` `WebSocket` into the `Socket` shape `@rtc/ws-effects` expects; the seam between this package's one framework dependency (`ws`) and the domain-blind effects framework.
6. `src/services/serviceContainer.ts` -- `createServices()`; ties each `@rtc/domain` simulator/port to its field on `Ctx`, the object every effect receives as its second argument.

## Auth

`POST /login` exchanges a username/password for a signed session token; the
WebSocket upgrade then requires that token as `?access=<token>`.

| Env var | Required | Holds |
|---|---|---|
| `AUTH_SECRET` | yes (Fly secret, set by hand) | HMAC secret that signs/verifies session tokens |
| `AUTH_USERS` | yes (Fly secret, set by hand) | The credential roster, `"user:pass,user2:pass2"` -- parsed by `loadUsers.ts` |
| `AUTH_TTL_MS` | no (defaults to 8h) | Session-token lifetime in milliseconds |

`/login` is rate-limited per source IP (`src/auth/rateLimit.ts`) and returns
`429` once exceeded, `401` on bad credentials, `200` with `{ token, user, exp
}` on success. The WS `verifyClient` hook (`authorizeUpgrade`) always rejects a
missing, malformed, or expired token -- there is no open-when-unset fallback.
Credentials are never committed to this repo; see
[docs/DEPLOY.md](../../docs/DEPLOY.md) and
[docs/env-files.md](../../docs/env-files.md) for how they're provisioned.

For the full end-to-end auth flow across both clients (login, resume-on-boot,
lock/unlock, the roster, and per-platform credential configuration), see
[docs/authentication.md](../../docs/authentication.md).

## How it's used

The server has no simulator/real-transport split -- it *is* the thing WS-real clients connect to. Its own composition root builds the services once, combines the 24 effects into one listener, wires up `/login` + the token-gated WS upgrade, and wires every incoming connection through it (`packages/server/src/index.ts`):

```ts
const services = createServices();
const listen = createWsListener(combineEffects(...allEffects), services);
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
    return authorizeUpgrade(info.req.url, auth);
  },
});

wss.on("connection", (ws) => {
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

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14.2 Adapter Tables Per App -- Server](../../docs/architecture/14-composition-and-wiring.md#142-adapter-tables-per-app)
- [§14.3 Boot Sequences -- Server](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences)
- [§7 The Declarative Effects Server](../../docs/architecture/07-communication-patterns.md#the-declarative-effects-server-rtcws-effects) -- why the old `wsHandler.ts` switch was replaced, and the error-isolation this package relies on
- [§10.6 Declarative WS effects over a server `switch`](../../docs/architecture/10-key-design-decisions.md#10-key-design-decisions) -- the design decision record
- [`@rtc/ws-effects` README](../ws-effects/README.md) -- the framework this package's `src/effects/` and `src/index.ts` are built on
