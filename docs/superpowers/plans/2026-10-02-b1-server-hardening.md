# B1 Server Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every server finding in the hardening spec (§2.2 S1–S13, plus the §9.2 in-app ban list and Fly `hard_limit`) so the deployed `@rtc/server` bounds what one caller can cost it — bytes, connections, messages, subscriptions, store growth and CPU — before the real stack is opened to registered users.

**Architecture:** Three stacked pull requests, each independently mergeable. **PR 1 — wire bounds**: every untrusted byte that enters an effect is bounded or validated at its parse seam (WS `maxPayload`, the `jarvis.chat` text cap, RPC/stream payload guards, per-connection subscription ceilings in `@rtc/ws-effects`, bounded simulator stores in `@rtc/domain`). **PR 2 — edge guards**: the HTTP/upgrade edge keys on the platform's trusted client IP, caps the login body, evicts the rate-limit table, hashes asynchronously, and gains an expiring ban list plus per-IP/total connection caps and a per-socket token bucket; `SET_THROUGHPUT` becomes per-connection. **PR 3 — deploy posture**: unprivileged container user, Fly concurrency limits, the grep gates that keep both, and the docs. Every limit is a named constant in one module, `packages/server/src/config/limits.ts`, so the numbers can be tuned in one place.

**Tech Stack:** TypeScript, Node 26 (`node:crypto` async `scrypt`), `ws` 8.21, RxJS 7 (ws-effects), vitest 4 (fake timers where a timer drives an outcome; most limits take an injected `now`), `scripts/mutation-check.mjs`, the `tests/fullstack/node-smoke.ts` real-server witness, `tests/scripts/grep-gates.ts`.

**Spec:** [../specs/2026-09-27-public-launch-hardening-design.md](../specs/2026-09-27-public-launch-hardening-design.md) §2.2 (findings S1–S13), §5 B1, §9.2 (ban list, Fly `hard_limit`).

## Global Constraints

- `@rtc/ws-effects` and `@rtc/domain` stay rxjs-only leaves (CLAUDE.md); nothing in this plan adds a dependency to any package.
- Intra-package imports use the `#/` alias in tests (`#/auth/rateLimit`), `./x.js` relative imports in source, matching each package's existing files.
- Every function is named for its **effect**, never its trigger (`docs/handler-naming.md`). Function-typed deps (`now`, `onStrike`, `relaunch`) are slots and stay as nouns.
- Braces on every control statement; explicit return types on every function and typed callback (Biome `useExplicitType`, CI mode); `padding-line-between-statements`; `rtc/newspaper-order` (exported API above helpers in source; cases above `create*` factories in tests).
- Fixture factories are `create*`; JSON payloads are object literals + `JSON.stringify`; no inline object types as type arguments (`toEqual<Named>`).
- A test waiting on a timer-driven outcome runs under `vi.useFakeTimers()`; the limiters below take an explicit `now` so most tests need no timers at all.
- Every new behaviour ships with at least one mutant in the PR's `mutants.json` (kept in the scratchpad, not committed) and the kill table is pasted in the PR body. A cross-package mutant (domain → server, ws-effects → server) needs that package rebuilt before the test runs and again after the restore (`pnpm --filter @rtc/<pkg> build`).
- Log lines never contain a payload body, a token, or a password. An IP address is fine.
- All limits live in `packages/server/src/config/limits.ts` (PR 1 creates it); the `jarvis.effects.ts` wire caps stay local to that module, as its existing comment requires.
- No lint suppressions. Run `pnpm exec biome ci --error-on-warnings .`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm typecheck`, `pnpm test`, `pnpm lint:dead`, `pnpm check:deps`, `pnpm --filter @rtc/tests gates` on the FINAL tree of each PR, then `pnpm test:e2e` once per PR (the node smoke gains witnesses in Tasks 1 and 15).
- Outward steps (push, `gh pr create`, `gh pr merge`) are one per Bash call, batched at the end: all three branches are pushed and opened back to back, then merged in order as each goes green.

## Review Focus

Inputs the spec implies but is silent about. Each has a test pinned in the owning task.

1. **A protocol-violating frame on an accepted socket** (oversized, bad UTF-8, reserved bits) makes `ws` emit `error` on that socket; with no listener Node throws and the whole process dies. The spec's S1 cap would turn every oversized frame into exactly this → Task 1 attaches the listener and the node smoke proves the server survives a 70 KiB frame (recorded as finding S14).
2. **`keyedStream` keys are caller-chosen strings.** A client sending `subscribe.pricing` with ten thousand distinct symbols leaves ten thousand `groupBy` groups alive for the life of the socket, even when every projection is `EMPTY` → Task 4 `maxKeys`.
3. **A `/login` body with `Content-Length` lying low** (header says 10, body streams 10 MB) must be cut off by bytes actually received, not by the header → Task 7 test "a body longer than its declared length is cut at the cap".
4. **A banned caller must cost nothing.** The ban check runs before JSON parsing, before the scrypt hash and before the upgrade's token verification → Task 12's upgrade-gate test asserts `auth.verifyToken` is never called for a banned IP; Task 11's login test asserts `auth.login` is never called.
5. **Evicting an RFQ must evict its quotes and cancel its expiry timer**, or the quote maps and the timeout set keep growing while the RFQ map stays bounded → Task 5 test "evicting an RFQ removes its quotes and its pending expiry".

---

## PR 1 — wire bounds (branch `worktree-b1-server-hardening`)

### Task 1: `limits.ts`, WS `maxPayload` (S1) and the socket `error` listener (S14)

**Files:**
- Create: `packages/server/src/config/limits.ts`
- Modify: `packages/server/src/index.ts` (WebSocketServer options; connection handler)
- Modify: `packages/server/src/observability/connectionLog.ts` + `connectionLog.test.ts` (`recordSocketError`)
- Modify: `tests/fullstack/node-smoke.ts` (oversized-frame witness)

**Interfaces:**
- Produces:
  ```ts
  // packages/server/src/config/limits.ts — every number below is referenced by name elsewhere in this plan.
  // knip fails the build on an export nothing consumes yet, so Task 1 creates the file with ONLY
  // WS_MAX_PAYLOAD_BYTES; each later task adds the constants it wires (same doc comments as here).
  export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;
  export const LOGIN_MAX_BODY_BYTES = 4 * 1024;
  export const MCP_MAX_BODY_BYTES = 64 * 1024;
  export const MAX_CONNECTIONS_TOTAL = 200;
  export const MAX_CONNECTIONS_PER_IP = 8;
  export const INBOUND_BURST = 100;
  export const INBOUND_REFILL_PER_SECOND = 25;
  export const INBOUND_DROPS_BEFORE_CLOSE = 100;
  export const LOGIN_RATE_LIMIT_MAX = 10;
  export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;
  export const RATE_LIMIT_MAX_KEYS = 10_000;
  export const BAN_STRIKES = 10;
  export const BAN_STRIKE_WINDOW_MS = 10 * 60_000;
  export const BAN_DURATION_MS = 15 * 60_000;
  export const BAN_MAX_ENTRIES = 10_000;
  export const TRUSTED_IP_HEADER_DEFAULT = "fly-client-ip";
  // connectionLog.ts
  recordSocketError(code: string): void;
  ```

- [ ] **Step 1: Create the limits module**

`packages/server/src/config/limits.ts`:

```ts
/**
 * Every per-caller bound the server enforces, in one place (hardening spec
 * §2.2 S1/S2/S4/S8 and §9.2). The values are deliberately generous for one
 * real client — a browser tab opens one socket and sends a few dozen frames
 * in its first second — and deliberately tight for a flood. Tune here, not
 * at the call sites.
 */

/** S1 — largest WebSocket frame accepted. The largest legitimate frame is a
 * `jarvis.chat` carrying 20 history entries of 2 000 chars plus a 4 000-char
 * message (~45 KiB with JSON overhead). `ws` closes the socket with 1009. */
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;

/** S2 — `/login` body cap. A username + password JSON object is < 200 bytes. */
export const LOGIN_MAX_BODY_BYTES = 4 * 1024;

/** `/mcp` body cap (declared length only — the MCP transport reads the body). */
export const MCP_MAX_BODY_BYTES = 64 * 1024;

/** S8 — live sockets across the whole process; below Fly's `hard_limit`
 * (fly.toml, 250) so the app refuses before the proxy starts queueing. */
export const MAX_CONNECTIONS_TOTAL = 200;

/** S8 — live sockets per client IP: several tabs plus a phone, not a flood. */
export const MAX_CONNECTIONS_PER_IP = 8;

/** S8 — per-socket inbound token bucket: burst capacity and refill rate. */
export const INBOUND_BURST = 100;
export const INBOUND_REFILL_PER_SECOND = 25;

/** S8 — frames dropped by an exhausted bucket before the socket is closed
 * (1008) and the caller takes a ban strike. */
export const INBOUND_DROPS_BEFORE_CLOSE = 100;

/** S3/S4 — `/login` attempts per IP per window (unchanged from before B1). */
export const LOGIN_RATE_LIMIT_MAX = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

/** S4 — distinct IPs the rate-limit table holds before evicting the oldest. */
export const RATE_LIMIT_MAX_KEYS = 10_000;

/** §9.2 — strikes (failed logins, rate-limit hits, oversized frames, floods)
 * within the window that earn a ban, and how long a ban lasts. */
export const BAN_STRIKES = 10;
export const BAN_STRIKE_WINDOW_MS = 10 * 60_000;
export const BAN_DURATION_MS = 15 * 60_000;
export const BAN_MAX_ENTRIES = 10_000;

/** S3 — the header Fly's proxy sets to the real client address. Overridable
 * via `RTC_TRUSTED_IP_HEADER` for a different proxy (e.g. Cloudflare's
 * `cf-connecting-ip`). Header names are compared lower-cased. */
export const TRUSTED_IP_HEADER_DEFAULT = "fly-client-ip";
```

- [ ] **Step 2: Write the failing connectionLog test**

Append to `packages/server/src/observability/connectionLog.test.ts` (inside the existing `describe`, matching its `out`/`now` injection style — read the file first and reuse its fixed clock):

```ts
  it("records a socket error by its code only", () => {
    const lines: string[] = [];
    const log = createConnectionLog(
      (line: string): void => {
        lines.push(line);
      },
      (): number => {
        return 0;
      },
    );

    log.recordSocketError("WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");

    expect(lines).toEqual([
      "[ws] 1970-01-01T00:00:00.000Z socket-error   code=WS_ERR_UNSUPPORTED_MESSAGE_LENGTH active=0",
    ]);
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rtc/server test connectionLog`
Expected: FAIL — `recordSocketError is not a function`.

- [ ] **Step 4: Implement `recordSocketError`**

In `packages/server/src/observability/connectionLog.ts`, add to the interface and the returned object:

```ts
  /** A protocol-level error on an accepted socket (oversized frame, bad
   * UTF-8, reserved bits). `ws` emits `error` for these and Node would throw
   * with no listener — so the listener exists, and logs the `code` only. */
  recordSocketError(code: string): void;
```

```ts
    recordSocketError(code: string): void {
      out(`[ws] ${stamp()} socket-error   code=${code} active=${active}`);
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/server test connectionLog`
Expected: PASS.

- [ ] **Step 6: Wire `maxPayload` and the error listener in `index.ts`**

In `packages/server/src/index.ts`:

```ts
import { WS_MAX_PAYLOAD_BYTES } from "./config/limits.js";
```

```ts
const wss = new WebSocketServer({
  server: httpServer,
  // S1 — `ws`'s default is 100 MiB, far more than the 256 MB VM. An
  // oversized frame closes THAT socket with 1009 and surfaces as an `error`
  // event on it (handled below, never thrown).
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  verifyClient: /* unchanged */,
});

interface CodedError {
  readonly code?: string;
}

wss.on("connection", (ws) => {
  connectionLog.recordConnect();
  // S14 — without this listener a single malformed frame is an unhandled
  // `error` event, which Node turns into a process crash.
  ws.on("error", (err: Error & CodedError) => {
    connectionLog.recordSocketError(err.code ?? err.name);
  });
  ws.on("close", () => {
    connectionLog.recordDisconnect();
  });
  listen(toSocket(ws));
});
```

- [ ] **Step 7: Add the oversized-frame witness to the node smoke**

In `tests/fullstack/node-smoke.ts`, add a function after `runChecks` and call it from `main` between `runChecks()` and `runGateSmoke()`:

```ts
/**
 * S1/S14 witness: a frame above `WS_MAX_PAYLOAD_BYTES` closes ONLY that
 * socket (code 1009) and the server keeps serving — proven by a fresh
 * `/health` round-trip afterwards. Before B1 the oversized frame was
 * accepted (100 MiB default) and, once capped, would have crashed the
 * process through the unhandled `error` event.
 */
async function runOversizedFrameSmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;
  const login = await loginForToken(httpBase);
  const { WebSocket } = await import("ws");
  const raw = new WebSocket(`ws://${HOST}:${PORT}/?access=${login.token}`);

  const closeCode = await new Promise<number>((resolve, reject) => {
    const guard = setTimeout(() => {
      reject(new Error("oversized frame: socket was not closed"));
    }, FIRST_VALUE_TIMEOUT_MS);
    raw.on("open", () => {
      raw.send("x".repeat(70 * 1024));
    });
    raw.on("close", (code: number) => {
      clearTimeout(guard);
      resolve(code);
    });
    raw.on("error", () => {
      // The server-side close races a client-side error on some platforms;
      // the close code is what we assert on.
    });
  });

  assert(closeCode === 1009, `oversized frame close code (got ${closeCode})`);
  await waitForHttp(`${httpBase}/health`, 5_000);
  console.log("  ✓ limits: 70 KiB frame closed with 1009, server still healthy");
}
```

- [ ] **Step 8: Run the smoke before and after the index.ts change**

Run (on the pre-change `index.ts`, via `git stash push -u -m b1-task1 packages/server/src/index.ts` → run → `git stash apply` → drop; or simply comment out the two edits): `pnpm --filter @rtc/tests test:fullstack:node`
Expected BEFORE: FAIL on `oversized frame: socket was not closed` (default cap is 100 MiB).
Expected AFTER: PASS with the new ✓ line.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/config/limits.ts packages/server/src/index.ts packages/server/src/observability tests/fullstack/node-smoke.ts
git commit -m "feat(server): cap WebSocket frames at 64 KiB and survive socket protocol errors (S1, S14)"
```

---

### Task 2: `jarvis.chat` text cap (S6)

**Files:**
- Modify: `packages/server/src/effects/jarvis.effects.ts` (`parseChatPayload`)
- Modify: `packages/server/src/effects/jarvis.effects.test.ts`

- [ ] **Step 1: Write the failing test**

Find the existing malformed-payload cases in `jarvis.effects.test.ts` (search `Malformed jarvis.chat payload`) and add beside them, reusing that block's harness/`createCtx` helpers exactly as its neighbours do:

```ts
  it("rejects a jarvis.chat text longer than the wire cap with a JARVIS_ERROR, and serves the next turn", () => {
    const { messages$, sent } = createJarvisHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "x".repeat(4_001), turnId: "t-long" },
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "x".repeat(4_000), turnId: "t-ok" },
    });

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_ERROR,
      payload: { turnId: "t-long", message: "Malformed jarvis.chat payload." },
    });
    expect(
      sent.some((frame) => {
        return (
          frame.type === SERVER_MSG.JARVIS_DELTA &&
          (frame.payload as { turnId: string }).turnId === "t-ok"
        );
      }),
    ).toBe(true);
  });
```

(If no `createJarvisHarness` exists under that name, use the file's actual harness factory; the point is one scripted-brain harness and two frames.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/server test jarvis.effects -t "longer than the wire cap"`
Expected: FAIL — the first frame is served as a normal turn (no `JARVIS_ERROR`).

- [ ] **Step 3: Implement the cap**

In `jarvis.effects.ts`, next to the two existing history caps:

```ts
const JARVIS_WIRE_HISTORY_MAX_ENTRIES = 20;
const JARVIS_WIRE_HISTORY_MAX_TEXT = 2_000;
/** S6 — the message itself was the one uncapped string on this frame. */
const JARVIS_WIRE_TEXT_MAX = 4_000;
```

and in `parseChatPayload`, after the `typeof text !== "string"` check:

```ts
  if (text.length > JARVIS_WIRE_TEXT_MAX) {
    return undefined;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/server test jarvis.effects`
Expected: PASS (whole file).

- [ ] **Step 5: Mutant**

Add to the PR's `mutants.json`:

```json
{
  "name": "S6 text cap: off-by-one lets a 4001-char text through",
  "file": "packages/server/src/effects/jarvis.effects.ts",
  "find": "text.length > JARVIS_WIRE_TEXT_MAX",
  "replace": "text.length > JARVIS_WIRE_TEXT_MAX + 1",
  "test": "pnpm --filter @rtc/server test jarvis.effects -t \"longer than the wire cap\""
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/effects/jarvis.effects.ts packages/server/src/effects/jarvis.effects.test.ts
git commit -m "feat(server): cap jarvis.chat text at 4000 chars at the parse seam (S6)"
```

---

### Task 3: validate every RPC and stream payload at the parse seam (S11)

**Files:**
- Create: `packages/server/src/effects/guards.ts`
- Create: `packages/server/src/effects/guards.test.ts`
- Modify: `packages/server/src/effects/fx.effects.ts`, `credit.effects.ts`, `equities.effects.ts`, `admin.effects.ts`
- Modify: the four matching `*.effects.test.ts`

**Interfaces:**
- Produces (`guards.ts`):
  ```ts
  export function isRecord(value: unknown): value is Record<string, unknown>;
  export function isFiniteNumber(value: unknown): value is number;
  export function isBoundedString(value: unknown, max: number): value is string;   // non-empty, length <= max
  export function isDirection(value: unknown): value is Direction;
  export function isCandleTimeframe(value: unknown): value is CandleTimeframe;
  export interface SymbolPayload { readonly symbol: string }               // moved here from fx/equities
  export interface CurrencyPayload { readonly currency: string }
  export interface CandlesPayload { readonly symbol: string; readonly timeframe?: CandleTimeframe }
  export interface CandleHistoryPayload { readonly symbol: string; readonly timeframe: CandleTimeframe; readonly beforeTime: number; readonly count: number }
  export interface OrderIdPayload { readonly orderId: string }
  export interface ThroughputPayload { readonly value: number }
  export interface QuoteIdPayload { readonly quoteId: number }
  export interface RfqIdPayload { readonly rfqId: number }
  export function isSymbolPayload(v: unknown): v is SymbolPayload;
  export function isCurrencyPayload(v: unknown): v is CurrencyPayload;
  export function isCandlesPayload(v: unknown): v is CandlesPayload;
  export function isCandleHistoryPayload(v: unknown): v is CandleHistoryPayload;
  export function isOrderIdPayload(v: unknown): v is OrderIdPayload;
  export function isThroughputPayload(v: unknown): v is ThroughputPayload;
  export function isQuoteIdPayload(v: unknown): v is QuoteIdPayload;
  export function isRfqIdPayload(v: unknown): v is RfqIdPayload;
  export function isExecutionRequestDto(v: unknown): v is ExecutionRequestDto;
  export function isCreateRfqRequestDto(v: unknown): v is CreateRfqRequestDto;
  export function isQuoteRequestDto(v: unknown): v is QuoteRequestDto;
  export function isPlaceOrderRequest(v: unknown): v is PlaceOrderRequest;
  export class MalformedPayloadError extends Error { constructor(frameType: string) }
  export function requireValid<T>(frameType: string, payload: unknown, guard: (v: unknown) => v is T): T; // throws MalformedPayloadError
  export const MAX_SYMBOL_LENGTH = 16; export const MAX_CURRENCY_LENGTH = 8; export const MAX_ID_LENGTH = 64;
  export const MAX_CANDLE_PAGE = 2_000; export const MAX_DEALERS_PER_RFQ = 32;
  ```

Behaviour: an `rpc()` handler calls `requireValid(...)` and lets the throw reach `rpc`'s `catchError` → the client receives a **nack** (every `portFactory.ts` adapter already handles `nack`). A `stream()`/`keyedStream()` projection returns `EMPTY` for an invalid payload (the frame is dropped; `keyOf` returns `""` for an invalid frame so `groupBy` never throws). `console.warn` once per dropped frame with `describeMalformedFrame`-style text (type only, no body).

- [ ] **Step 1: Write the failing guard tests**

`packages/server/src/effects/guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

import {
  isBoundedString,
  isCandleHistoryPayload,
  isCreateRfqRequestDto,
  isExecutionRequestDto,
  isPlaceOrderRequest,
  isSymbolPayload,
  MalformedPayloadError,
  requireValid,
} from "#/effects/guards";

describe("guards", () => {
  it("isBoundedString rejects empty, over-long and non-string values", () => {
    expect(isBoundedString("EURUSD", 16)).toBe(true);
    expect(isBoundedString("", 16)).toBe(false);
    expect(isBoundedString("x".repeat(17), 16)).toBe(false);
    expect(isBoundedString(42, 16)).toBe(false);
  });

  it("isSymbolPayload needs a bounded symbol string", () => {
    expect(isSymbolPayload({ symbol: "EURUSD" })).toBe(true);
    expect(isSymbolPayload({ symbol: "x".repeat(17) })).toBe(false);
    expect(isSymbolPayload({})).toBe(false);
    expect(isSymbolPayload(undefined)).toBe(false);
  });

  it("isExecutionRequestDto checks every field and the direction enum", () => {
    expect(isExecutionRequestDto(createExecutionRequest())).toBe(true);
    expect(isExecutionRequestDto(createExecutionRequest({ direction: "Long" }))).toBe(false);
    expect(isExecutionRequestDto(createExecutionRequest({ notional: Number.NaN }))).toBe(false);
    expect(isExecutionRequestDto(createExecutionRequest({ notional: -1 }))).toBe(false);
    expect(isExecutionRequestDto(createExecutionRequest({ currencyPair: "" }))).toBe(false);
  });

  it("isCreateRfqRequestDto bounds the dealer list and requires finite numbers", () => {
    expect(isCreateRfqRequestDto(createRfqRequest())).toBe(true);
    expect(isCreateRfqRequestDto(createRfqRequest({ dealerIds: Array.from({ length: 33 }, (_, i) => i) }))).toBe(false);
    expect(isCreateRfqRequestDto(createRfqRequest({ dealerIds: ["0"] }))).toBe(false);
    expect(isCreateRfqRequestDto(createRfqRequest({ expirySecs: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it("isCandleHistoryPayload caps the page size and validates the timeframe", () => {
    expect(isCandleHistoryPayload({ symbol: "AAPL", timeframe: "1D", beforeTime: 1, count: 200 })).toBe(true);
    expect(isCandleHistoryPayload({ symbol: "AAPL", timeframe: "1D", beforeTime: 1, count: 2_001 })).toBe(false);
    expect(isCandleHistoryPayload({ symbol: "AAPL", timeframe: "2Y", beforeTime: 1, count: 10 })).toBe(false);
  });

  it("isPlaceOrderRequest requires the side/type unions and a positive qty; limitPrice only when present", () => {
    expect(isPlaceOrderRequest({ symbol: "AAPL", side: "buy", type: "market", qty: 10 })).toBe(true);
    expect(isPlaceOrderRequest({ symbol: "AAPL", side: "buy", type: "limit", qty: 10, limitPrice: 101.5 })).toBe(true);
    expect(isPlaceOrderRequest({ symbol: "AAPL", side: "hold", type: "market", qty: 10 })).toBe(false);
    expect(isPlaceOrderRequest({ symbol: "AAPL", side: "buy", type: "market", qty: 0 })).toBe(false);
    expect(isPlaceOrderRequest({ symbol: "AAPL", side: "buy", type: "limit", qty: 1, limitPrice: "cheap" })).toBe(false);
  });

  it("requireValid returns the narrowed payload or throws MalformedPayloadError naming the frame type", () => {
    expect(requireValid("x.y", { symbol: "EURUSD" }, isSymbolPayload)).toEqual({ symbol: "EURUSD" });
    expect(() => {
      return requireValid("x.y", {}, isSymbolPayload);
    }).toThrowError(MalformedPayloadError);
    expect(() => {
      return requireValid("x.y", {}, isSymbolPayload);
    }).toThrowError("malformed x.y payload");
  });
});

function createExecutionRequest(overrides: Record<string, unknown> = {}): unknown {
  return {
    currencyPair: "EURUSD",
    spotRate: 1.1,
    valueDate: "2026-10-06",
    direction: Direction.Buy,
    notional: 1_000_000,
    dealtCurrency: "EUR",
    ...overrides,
  };
}

function createRfqRequest(overrides: Record<string, unknown> = {}): unknown {
  return {
    instrumentId: 1,
    dealerIds: [0, 1],
    quantity: 1_000_000,
    direction: Direction.Buy,
    expirySecs: 120,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @rtc/server test guards`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `guards.ts`**

```ts
import { CANDLE_TIMEFRAMES, type CandleTimeframe, Direction, type PlaceOrderRequest } from "@rtc/domain";
import type { CreateRfqRequestDto, ExecutionRequestDto, QuoteRequestDto } from "@rtc/shared";

/** S11 — the trust boundary for every non-Jarvis inbound payload. The
 * effects used to cast (`payload as SymbolPayload`); a malformed frame then
 * threw inside the effect and `combineEffects` replaced that effect with
 * `EMPTY` for the rest of the connection. Now an `rpc()` handler throws
 * `MalformedPayloadError` (→ nack, the client already handles it) and a
 * `stream()` projection returns `EMPTY` (frame dropped, effect alive). */

export const MAX_SYMBOL_LENGTH = 16;
export const MAX_CURRENCY_LENGTH = 8;
export const MAX_ID_LENGTH = 64;
export const MAX_CANDLE_PAGE = 2_000;
export const MAX_DEALERS_PER_RFQ = 32;

export interface SymbolPayload {
  readonly symbol: string;
}

export interface CurrencyPayload {
  readonly currency: string;
}

export interface CandlesPayload {
  readonly symbol: string;
  readonly timeframe?: CandleTimeframe;
}

export interface CandleHistoryPayload {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly beforeTime: number;
  readonly count: number;
}

export interface OrderIdPayload {
  readonly orderId: string;
}

export interface ThroughputPayload {
  readonly value: number;
}

export interface QuoteIdPayload {
  readonly quoteId: number;
}

export interface RfqIdPayload {
  readonly rfqId: number;
}

export class MalformedPayloadError extends Error {
  constructor(frameType: string) {
    super(`malformed ${frameType} payload`);
    this.name = "MalformedPayloadError";
  }
}

export function requireValid<T>(
  frameType: string,
  payload: unknown,
  guard: (value: unknown) => value is T,
): T {
  if (guard(payload)) {
    return payload;
  }

  console.warn(`${frameType}: nacking malformed payload (body omitted)`);
  throw new MalformedPayloadError(frameType);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isDirection(value: unknown): value is Direction {
  return value === Direction.Buy || value === Direction.Sell;
}

export function isCandleTimeframe(value: unknown): value is CandleTimeframe {
  return (CANDLE_TIMEFRAMES as readonly unknown[]).includes(value);
}

export function isSymbolPayload(value: unknown): value is SymbolPayload {
  return isRecord(value) && isBoundedString(value.symbol, MAX_SYMBOL_LENGTH);
}

export function isCurrencyPayload(value: unknown): value is CurrencyPayload {
  return isRecord(value) && isBoundedString(value.currency, MAX_CURRENCY_LENGTH);
}

export function isCandlesPayload(value: unknown): value is CandlesPayload {
  return (
    isSymbolPayload(value) &&
    ((value as Record<string, unknown>).timeframe === undefined ||
      isCandleTimeframe((value as Record<string, unknown>).timeframe))
  );
}

export function isCandleHistoryPayload(value: unknown): value is CandleHistoryPayload {
  return (
    isSymbolPayload(value) &&
    isCandleTimeframe((value as Record<string, unknown>).timeframe) &&
    isFiniteNumber((value as Record<string, unknown>).beforeTime) &&
    isPositiveInteger((value as Record<string, unknown>).count, MAX_CANDLE_PAGE)
  );
}

export function isOrderIdPayload(value: unknown): value is OrderIdPayload {
  return isRecord(value) && isBoundedString(value.orderId, MAX_ID_LENGTH);
}

export function isThroughputPayload(value: unknown): value is ThroughputPayload {
  return isRecord(value) && isFiniteNumber(value.value);
}

export function isQuoteIdPayload(value: unknown): value is QuoteIdPayload {
  return isRecord(value) && isFiniteNumber(value.quoteId);
}

export function isRfqIdPayload(value: unknown): value is RfqIdPayload {
  return isRecord(value) && isFiniteNumber(value.rfqId);
}

export function isExecutionRequestDto(value: unknown): value is ExecutionRequestDto {
  return (
    isRecord(value) &&
    isBoundedString(value.currencyPair, MAX_SYMBOL_LENGTH) &&
    isFiniteNumber(value.spotRate) &&
    isBoundedString(value.valueDate, MAX_ID_LENGTH) &&
    isDirection(value.direction) &&
    isFiniteNumber(value.notional) &&
    value.notional > 0 &&
    isBoundedString(value.dealtCurrency, MAX_CURRENCY_LENGTH)
  );
}

export function isCreateRfqRequestDto(value: unknown): value is CreateRfqRequestDto {
  return (
    isRecord(value) &&
    isFiniteNumber(value.instrumentId) &&
    Array.isArray(value.dealerIds) &&
    value.dealerIds.length <= MAX_DEALERS_PER_RFQ &&
    value.dealerIds.every(isFiniteNumber) &&
    isFiniteNumber(value.quantity) &&
    value.quantity > 0 &&
    isDirection(value.direction) &&
    isFiniteNumber(value.expirySecs) &&
    value.expirySecs > 0
  );
}

export function isQuoteRequestDto(value: unknown): value is QuoteRequestDto {
  return isRecord(value) && isFiniteNumber(value.quoteId) && isFiniteNumber(value.price);
}

export function isPlaceOrderRequest(value: unknown): value is PlaceOrderRequest {
  return (
    isRecord(value) &&
    isBoundedString(value.symbol, MAX_SYMBOL_LENGTH) &&
    (value.side === "buy" || value.side === "sell") &&
    (value.type === "market" || value.type === "limit") &&
    isFiniteNumber(value.qty) &&
    value.qty > 0 &&
    (value.limitPrice === undefined || isFiniteNumber(value.limitPrice))
  );
}

function isPositiveInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= max;
}
```

`ExecutionRequestDto.valueDate` is required on the DTO and the real client does send it (`packages/client-core/src/adapters/portFactory.ts:368`, `new Date().toISOString().slice(0, 10)`), so the guard may require it. General rule for every guard here: never stricter than what `portFactory.ts` actually sends — a guard the real client fails is a self-inflicted outage. Before adopting a guard in Step 7, grep the matching `send`/`rpc` call in `portFactory.ts` and confirm each required field is present.

- [ ] **Step 4: Run the guard tests**

Run: `pnpm --filter @rtc/server test guards`
Expected: PASS.

- [ ] **Step 5: Write the failing per-effect tests**

One test per effect file, each proving BOTH halves: the malformed frame is nacked/dropped AND the next valid frame on the same socket is still served (the pre-B1 failure mode was "the effect dies for the rest of the connection"). Reuse each file's existing `harness`/ctx helpers.

`fx.effects.test.ts`:

```ts
  it("nacks a malformed EXECUTE_TRADE and still acks the next valid one (S11)", () => {
    const { messages$, sent } = harness(createCtx());

    messages$.next({ type: CLIENT_MSG.EXECUTE_TRADE, payload: { notional: "lots" }, correlationId: "bad" });
    messages$.next({ type: CLIENT_MSG.EXECUTE_TRADE, payload: createExecutionRequest(), correlationId: "ok" });

    expect(sent.find((f) => { return f.correlationId === "bad"; })?.payload).toEqual({ type: "nack" });
    expect((sent.find((f) => { return f.correlationId === "ok"; })?.payload as { type: string }).type).toBe("ack");
  });

  it("drops a SUBSCRIBE_PRICING frame without a symbol and keeps the effect alive for the next one (S11)", () => {
    const { messages$, sent } = harness(createCtx());

    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: {} });
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } });

    expect(sent.filter((f) => { return f.type === SERVER_MSG.PRICE_TICK; }).length).toBeGreaterThan(0);
  });
```

(`PRICE_TICK` is whatever `SERVER_MSG` constant the pricing keyedStream emits — read `fx.effects.ts` and the existing pricing test to use the right constant and the right way to drive a tick; the file already has such a test to copy from.)

`credit.effects.test.ts`: the same pair for `CREATE_RFQ` (malformed: `{ dealerIds: "all" }`) then a valid `createRfqRequest()`.

`equities.effects.test.ts`: the same pair for `PLACE_ORDER` (malformed: `{ symbol: "AAPL", side: "hold", type: "market", qty: 1 }`), asserting the malformed frame produces **no** `ORDER_LIFECYCLE` frames and no ack, and the next valid one acks. Plus `GET_CANDLE_HISTORY` with `count: 5_000` → nack.

`admin.effects.test.ts`: `SET_THROUGHPUT` with `{ value: "fast" }` → nack and `setThroughput` not called.

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter @rtc/server test effects`
Expected: the new cases FAIL (today a malformed RPC either acks with garbage or kills the effect).

- [ ] **Step 7: Adopt the guards in the four effect files**

Pattern for an `rpc()` handler (every one of them):

```ts
const executeTrade$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.EXECUTE_TRADE,
  SERVER_MSG.EXECUTION_RESPONSE,
  (payload, ctx): Observable<ExecutionResponseDto> => {
    const req = requireValid(CLIENT_MSG.EXECUTE_TRADE, payload, isExecutionRequestDto);
    return ctx.execution.executeTrade({ /* unchanged */ });
  },
);
```

Pattern for a `stream()` projection with a payload:

```ts
const analytics$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_ANALYTICS,
  (payload, ctx) => {
    if (!isCurrencyPayload(payload)) {
      console.warn(`${CLIENT_MSG.SUBSCRIBE_ANALYTICS}: dropping malformed payload (body omitted)`);
      return EMPTY;
    }

    return ctx.analytics.getAnalytics(payload.currency).pipe(/* unchanged */);
  },
);
```

Pattern for `keyedStream` (`pricing$` in fx; the two in equities):

```ts
const pricing$: WsEffect<Ctx> = keyedStream(
  CLIENT_MSG.SUBSCRIBE_PRICING,
  CLIENT_MSG.UNSUBSCRIBE_PRICING,
  (payload): string => {
    return isSymbolPayload(payload) ? payload.symbol : "";
  },
  (payload, ctx) => {
    if (!isSymbolPayload(payload)) {
      return EMPTY;
    }

    return ctx.pricing.getPriceUpdates(payload.symbol).pipe(/* unchanged */);
  },
);
```

`placeOrder$` (the raw primitive in equities): guard first; on failure emit nothing for that frame (`return EMPTY` inside the `mergeMap`). Delete the four local `interface *Payload` declarations now provided by `guards.ts`.

- [ ] **Step 8: Run all server tests**

Run: `pnpm --filter @rtc/server test`
Expected: PASS.

- [ ] **Step 9: Mutants**

```json
[
  {
    "name": "S11 fx: dropping the execute guard acks garbage instead of nacking",
    "file": "packages/server/src/effects/fx.effects.ts",
    "find": "requireValid(CLIENT_MSG.EXECUTE_TRADE, payload, isExecutionRequestDto)",
    "replace": "payload as ExecutionRequestDto",
    "test": "pnpm --filter @rtc/server test fx.effects -t \"malformed EXECUTE_TRADE\""
  },
  {
    "name": "S11 guards: notional sign check dropped",
    "file": "packages/server/src/effects/guards.ts",
    "find": "value.notional > 0 &&",
    "replace": "",
    "test": "pnpm --filter @rtc/server test guards -t \"isExecutionRequestDto\""
  },
  {
    "name": "S11 guards: dealer-list cap dropped",
    "file": "packages/server/src/effects/guards.ts",
    "find": "value.dealerIds.length <= MAX_DEALERS_PER_RFQ &&",
    "replace": "",
    "test": "pnpm --filter @rtc/server test guards -t \"isCreateRfqRequestDto\""
  }
]
```

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/effects
git commit -m "feat(server): validate every RPC and stream payload at the parse seam — nack or drop, never kill the effect (S11)"
```

---

### Task 4: per-connection subscription ceilings in `@rtc/ws-effects` (S8, part c)

**Files:**
- Modify: `packages/ws-effects/src/stream.ts` + `stream.test.ts`
- Modify: `packages/ws-effects/src/keyedStream.ts` + `keyedStream.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StreamOptions { readonly maxActive?: number }          // default 64
  export function stream<Ctx>(inType, project, options?: StreamOptions): WsEffect<Ctx>;
  export interface KeyedStreamOptions { readonly maxKeys?: number }        // default 128
  export function keyedStream<Ctx>(subType, unsubType, keyOf, project, options?: KeyedStreamOptions): WsEffect<Ctx>;
  ```
  Both are per **effect invocation**, i.e. per connection (each `createWsListener` call invokes every effect once per socket).

- [ ] **Step 1: Write the failing `stream` test**

Append to `stream.test.ts`:

```ts
  it("drops a matching inbound once maxActive inner streams are live, and accepts again when one completes", () => {
    const inners: Subject<Outbound>[] = [];
    const effect = stream<unknown>(
      "subscribe.x",
      () => {
        const inner = new Subject<Outbound>();
        inners.push(inner);
        return inner;
      },
      { maxActive: 2 },
    );
    const in$ = new Subject<Inbound>();
    const outs: Outbound[] = [];
    effect(in$, undefined).subscribe((frame: Outbound) => {
      outs.push(frame);
    });

    in$.next({ type: "subscribe.x" });
    in$.next({ type: "subscribe.x" });
    in$.next({ type: "subscribe.x" });
    expect(inners).toHaveLength(2);

    inners[0]?.complete();
    in$.next({ type: "subscribe.x" });
    expect(inners).toHaveLength(3);

    inners[2]?.next(out("tick", 3));
    expect(outs).toEqual([out("tick", 3)]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/ws-effects test stream`
Expected: FAIL — three inners are created (no ceiling).

- [ ] **Step 3: Implement the ceiling**

`stream.ts`:

```ts
import { catchError, EMPTY, finalize, mergeMap, type Observable } from "rxjs";

export interface StreamOptions {
  /** Live inner streams this effect may hold per connection before further
   * matching frames are dropped (S8). Default `DEFAULT_MAX_ACTIVE`. */
  readonly maxActive?: number;
}

/** Legitimate clients hold a handful of inner streams per effect (one per
 * subscribed currency, symbol, …); a flood of subscribe frames would hold
 * thousands, each a live simulator producer. */
const DEFAULT_MAX_ACTIVE = 64;

export function stream<Ctx>(
  inType: string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
  options: StreamOptions = {},
): WsEffect<Ctx> {
  const maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE;

  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    let active = 0;

    return in$.pipe(
      matchType(inType),
      mergeMap((msg) => {
        if (active >= maxActive) {
          console.warn(`ws-effects: ${inType} dropped — ${maxActive} streams already live on this connection`);
          return EMPTY;
        }

        active += 1;

        return project(msg.payload, ctx).pipe(
          catchError((err: unknown) => {
            console.error("ws-effects: stream effect error", err);
            return EMPTY;
          }),
          finalize(() => {
            active -= 1;
          }),
        );
      }),
    );
  };
}
```

- [ ] **Step 4: Run the stream tests**

Run: `pnpm --filter @rtc/ws-effects test stream`
Expected: PASS (all cases, including the existing concurrency one — a ceiling of 64 does not interfere).

- [ ] **Step 5: Write the failing `keyedStream` test**

Append to `keyedStream.test.ts` (match the file's harness style):

```ts
  it("ignores a never-seen key once maxKeys distinct keys exist, but still serves known keys", () => {
    const projected: string[] = [];
    const effect = keyedStream<unknown>(
      "sub",
      "unsub",
      (payload): string => {
        return (payload as { key: string }).key;
      },
      (payload) => {
        projected.push((payload as { key: string }).key);
        return new Subject<Outbound>();
      },
      { maxKeys: 2 },
    );
    const in$ = new Subject<Inbound>();
    effect(in$, undefined).subscribe();

    in$.next({ type: "sub", payload: { key: "a" } });
    in$.next({ type: "sub", payload: { key: "b" } });
    in$.next({ type: "sub", payload: { key: "c" } });
    in$.next({ type: "unsub", payload: { key: "a" } });
    in$.next({ type: "sub", payload: { key: "a" } });

    expect(projected).toEqual(["a", "b", "a"]);
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/ws-effects test keyedStream`
Expected: FAIL — `["a", "b", "c", "a"]`.

- [ ] **Step 7: Implement `maxKeys`**

In `keyedStream.ts`, add the options type and a seen-key pre-filter ahead of `groupBy`:

```ts
export interface KeyedStreamOptions {
  /** Distinct keys this effect will ever track per connection (S8). A key
   * is caller-chosen (a symbol string), so without a cap one socket can
   * hold an unbounded number of `groupBy` groups alive. Default
   * `DEFAULT_MAX_KEYS`. */
  readonly maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 128;
```

```ts
  options: KeyedStreamOptions = {},
): WsEffect<Ctx> {
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;

  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    const seen = new Set<string>();

    return in$.pipe(
      filter((msg) => {
        return msg.type === subType || msg.type === unsubType;
      }),
      filter((msg) => {
        const key = keyOf(msg.payload);

        if (key === "") {
          return false;
        }

        if (seen.has(key)) {
          return true;
        }

        if (seen.size >= maxKeys) {
          console.warn(`ws-effects: ${subType} key ignored — ${maxKeys} keys already tracked on this connection`);
          return false;
        }

        seen.add(key);
        return true;
      }),
      groupBy(/* unchanged */),
```

(The `key === ""` branch is the Task 3 contract: `keyOf` returns `""` for a malformed frame, and that frame is dropped before `groupBy` instead of creating an empty-key group.)

- [ ] **Step 8: Run the ws-effects tests, then the server tests (consumer)**

Run: `pnpm --filter @rtc/ws-effects test && pnpm --filter @rtc/ws-effects build && pnpm --filter @rtc/server test`
Expected: PASS.

- [ ] **Step 9: Mutants**

```json
[
  {
    "name": "S8c stream: ceiling comparison inverted",
    "file": "packages/ws-effects/src/stream.ts",
    "find": "if (active >= maxActive) {",
    "replace": "if (active > maxActive) {",
    "test": "pnpm --filter @rtc/ws-effects test stream -t \"maxActive\""
  },
  {
    "name": "S8c stream: finalize never releases a slot",
    "file": "packages/ws-effects/src/stream.ts",
    "find": "active -= 1;",
    "replace": "active -= 0;",
    "test": "pnpm --filter @rtc/ws-effects test stream -t \"maxActive\""
  },
  {
    "name": "S8c keyedStream: seen set never consulted",
    "file": "packages/ws-effects/src/keyedStream.ts",
    "find": "if (seen.size >= maxKeys) {",
    "replace": "if (seen.size > maxKeys + 1) {",
    "test": "pnpm --filter @rtc/ws-effects test keyedStream -t \"maxKeys\""
  }
]
```

- [ ] **Step 10: Commit**

```bash
git add packages/ws-effects/src
git commit -m "feat(ws-effects): per-connection ceilings — stream() maxActive, keyedStream() maxKeys (S8)"
```

---

### Task 5: bound the shared simulator stores (S9)

**Files:**
- Modify: `packages/domain/src/simulators/TradeStoreSimulator.ts` + `TradeStoreSimulator.test.ts`
- Modify: `packages/domain/src/simulators/EquityOrderSimulator.ts` + new `EquityOrderSimulator.bounded.test.ts`
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.ts` + new `CreditRfqSimulator.bounded.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // TradeStoreSimulator
  constructor(executionEngine: ExecutionSimulator, seedBaseMs: number = Date.now(), maxTrades: number = DEFAULT_MAX_TRADES /* 500 */)
  // EquityOrderSimulator
  export interface EquityOrderDeps { listener?; seed?; markFor?; maxOrders?: number /* default 500 */ }
  // CreditRfqSimulator
  constructor(dealers: readonly Dealer[], maxRfqs: number = DEFAULT_MAX_RFQS /* 200 */)
  ```
  Eviction is **oldest first** (Map/array insertion order) and the seeds count toward the cap. `createServices()` in the server passes nothing, so the defaults apply there; the client-core simulator composition is untouched.

- [ ] **Step 1: Write the failing trade-store test**

Append to `TradeStoreSimulator.test.ts` (look at how the file constructs an `ExecutionSimulator` and fires trades; mirror it):

```ts
  it("keeps at most maxTrades, evicting the oldest first (S9)", async () => {
    const execution = new ExecutionSimulator();
    const store = new TradeStoreSimulator(execution, 0, 8);
    const snapshots: readonly Trade[][] = [];
    store.getTradeStream().subscribe((trades) => {
      snapshots.push([...trades]);
    });

    for (let i = 0; i < 3; i += 1) {
      await lastValueFrom(execution.executeTrade(createTradeRequest()));
    }

    const latest = snapshots.at(-1) ?? [];
    expect(latest).toHaveLength(8);
    expect(latest.map((t) => { return t.tradeId; })).not.toContain(1);
    expect(latest[0]?.tradeId).toBeGreaterThan(7);
  });
```

(The seven seed trades + three executed = ten; a cap of eight evicts the two oldest seeds. Seed ids and the `createTradeRequest` factory: take them from the existing file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/domain test TradeStoreSimulator`
Expected: FAIL — length 10.

- [ ] **Step 3: Implement the trade cap**

```ts
/** S9 — the blotter is a shared, process-lifetime store fed by every
 * connection's trades. Bounded so a scripted client cannot grow it (and the
 * snapshot every blotter subscriber receives) without limit. */
const DEFAULT_MAX_TRADES = 500;
```

```ts
  constructor(
    executionEngine: ExecutionSimulator,
    seedBaseMs: number = Date.now(),
    private readonly maxTrades: number = DEFAULT_MAX_TRADES,
  ) {
    /* seeds unchanged */
    executionEngine.onTrade((trade) => {
      this.trades.set(trade.tradeId, trade);
      this.evictOldest();
      this.snapshots$.next(this.snapshot());
    });
  }

  private evictOldest(): void {
    while (this.trades.size > this.maxTrades) {
      const oldest = this.trades.keys().next();

      if (oldest.done) {
        return;
      }

      this.trades.delete(oldest.value);
    }
  }
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @rtc/domain test TradeStoreSimulator`
Expected: PASS.

- [ ] **Step 5: Write the failing order-book test**

`EquityOrderSimulator.bounded.test.ts`:

```ts
import { lastValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { EquityOrderSimulator } from "#/simulators/EquityOrderSimulator";

describe("EquityOrderSimulator — bounded book (S9)", () => {
  it("keeps at most maxOrders, evicting the oldest order", async () => {
    vi.useFakeTimers();
    const sim = new EquityOrderSimulator({ maxOrders: 2 });

    for (const symbol of ["AAPL", "MSFT", "NVDA"]) {
      const placed = lastValueFrom(sim.place(createOrder(symbol)));
      await vi.advanceTimersByTimeAsync(2_000);
      await placed;
    }

    const book = await lastValueFrom(sim.orders());
    expect(book.map((o) => { return o.symbol; })).toEqual(["MSFT", "NVDA"]);
    vi.useRealTimers();
  });
});

function createOrder(symbol: string): Parameters<EquityOrderSimulator["place"]>[0] {
  return { symbol, side: "buy", type: "market", qty: 10 };
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/domain test EquityOrderSimulator.bounded`
Expected: FAIL — three orders in the book.

- [ ] **Step 7: Implement the order cap**

```ts
export interface EquityOrderDeps {
  listener?: OrderListener;
  seed?: number;
  markFor?: (symbol: string) => number;
  /** S9 — book size cap; the oldest order is evicted first. Default 500. */
  maxOrders?: number;
}

const DEFAULT_MAX_ORDERS = 500;
```

In `upsert`, after `this.book.push(order)`:

```ts
      const max = this.deps.maxOrders ?? DEFAULT_MAX_ORDERS;

      while (this.book.length > max) {
        this.book.shift();
      }
```

- [ ] **Step 8: Run the test**

Run: `pnpm --filter @rtc/domain test EquityOrderSimulator`
Expected: PASS (all EquityOrderSimulator files).

- [ ] **Step 9: Write the failing RFQ test (Review Focus 5)**

`CreditRfqSimulator.bounded.test.ts`:

```ts
import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEALERS_CATALOG } from "#/credit/dealers";
import { Direction } from "#/fx/trade";
import { CreditRfqSimulator } from "#/simulators/CreditRfqSimulator";

describe("CreditRfqSimulator — bounded store (S9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicting an RFQ removes its quotes and cancels its expiry timer, and the SoW shrinks to the cap", async () => {
    // The constructor seeds FOUR RFQs (ids 238, 237, 235, …) with twelve
    // quotes and no expiry timers. A cap of 1 leaves one seed standing.
    const sim = new CreditRfqSimulator(DEALERS_CATALOG, 1);
    expect((await collectSow(sim)).rfqIds).toHaveLength(1);

    const first = await firstValueFrom(sim.createRfq(createRfqRequest()));
    expect((await collectSow(sim)).rfqIds).toEqual([first]);
    expect(sim.expiryTimerCount()).toBe(1);

    const second = await firstValueFrom(sim.createRfq(createRfqRequest()));
    const sow = await collectSow(sim);

    expect(sow.rfqIds).toEqual([second]);
    expect(sow.quoteRfqIds.every((id) => { return id === second; })).toBe(true);
    // `first`'s expiry timer was cancelled with it — only `second`'s remains…
    expect(sim.expiryTimerCount()).toBe(1);

    // …and it fires on schedule, removing itself.
    await vi.advanceTimersByTimeAsync(130_000);
    expect(sim.expiryTimerCount()).toBe(0);
  });
});

interface SowShape {
  readonly rfqIds: number[];
  readonly quoteRfqIds: number[];
}

async function collectSow(sim: CreditRfqSimulator): Promise<SowShape> {
  const events = await lastValueFrom(
    sim.events().pipe(
      takeWhile((e) => { return e.type !== "endOfStateOfTheWorld"; }),
      toArray(),
    ),
  );
  return {
    rfqIds: events.flatMap((e) => { return e.type === "rfqCreated" ? [e.payload.id] : []; }),
    quoteRfqIds: events.flatMap((e) => { return e.type === "quoteCreated" ? [e.payload.rfqId] : []; }),
  };
}

function createRfqRequest(): Parameters<CreditRfqSimulator["createRfq"]>[0] {
  return { instrumentId: 1, dealerIds: [0, 1], quantity: 1_000_000, direction: Direction.Buy, expirySecs: 120 };
}
```

(Import `takeWhile` from rxjs. `DEALERS_CATALOG` lives in `#/simulators/DealerSimulator`, not a `credit/` module — fix the import above. The seed set is four RFQs: `grep -c "instrumentId:" CreditRfqSimulator.ts` → 4.)

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm --filter @rtc/domain test CreditRfqSimulator.bounded`
Expected: FAIL — `expiryTimerCount is not a function` (and, once that exists, five RFQs in the SoW).

- [ ] **Step 11: Implement the RFQ cap**

```ts
/** S9 — RFQs (and their quotes and expiry timers) are evicted oldest-first
 * past this count. Each eviction removes the RFQ, every quote attached to
 * it and its pending expiry timer, so the three maps and the timer set stay
 * bounded together. */
const DEFAULT_MAX_RFQS = 200;
```

```ts
  constructor(dealers: readonly Dealer[], private readonly maxRfqs: number = DEFAULT_MAX_RFQS) {
```

Timers today: `private schedule(run, delayMs): void` adds a handle to `pendingTimeouts: Set<…>` and the handle deletes itself when it fires; `scheduleExpiry` and `scheduleDealerResponse` both go through it; `dispose()` clears the set. Eviction must cancel ONE RFQ's expiry timer, so keep the Set (dealer-response timers still live there) and add a per-RFQ index beside it:

```ts
  private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  /** rfqId → its expiry handle, so eviction can cancel exactly that timer.
   * Entries remove themselves when the timer fires. */
  private readonly expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();
```

`schedule` returns the handle (`): ReturnType<typeof setTimeout> {` … `return timeout;`). `scheduleExpiry` records it and clears the index inside the callback:

```ts
  private scheduleExpiry(rfqId: number, expirySecs: number): void {
    const handle = this.schedule(() => {
      this.expiryTimers.delete(rfqId);
      /* existing body unchanged */
    }, expirySecs * 1000);
    this.expiryTimers.set(rfqId, handle);
  }
```

Then:

```ts
  /** Test seam for the bounded-store witness: expiry timers still armed. */
  expiryTimerCount(): number {
    return this.expiryTimers.size;
  }

  private evictOldestRfqs(): void {
    while (this.rfqs.size > this.maxRfqs) {
      const oldest = this.rfqs.keys().next();

      if (oldest.done) {
        return;
      }

      this.evictRfq(oldest.value);
    }
  }

  private evictRfq(rfqId: number): void {
    for (const quoteId of this.rfqQuotes.get(rfqId) ?? []) {
      this.quotes.delete(quoteId);
    }

    this.rfqQuotes.delete(rfqId);
    this.rfqs.delete(rfqId);

    const timer = this.expiryTimers.get(rfqId);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingTimeouts.delete(timer);
      this.expiryTimers.delete(rfqId);
    }
  }
```

Call `this.evictOldestRfqs()` twice: at the end of the constructor (after the seed loops, so a cap below the seed count is honoured — the bounded test relies on this) and in `createRfq` right after `this.rfqs.set(rfqId, rfq)` and `this.rfqQuotes.set(rfqId, rfqQuoteList)` (so the new RFQ is never the one evicted when the cap is ≥ 1). `dispose()` additionally does `this.expiryTimers.clear()`.

- [ ] **Step 12: Run all domain tests, rebuild, run server tests**

Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain build && pnpm --filter @rtc/server test`
Expected: PASS. (The server's credit effect tests construct `CreditRfqSimulator(DEALERS_CATALOG)` — the default cap of 200 leaves them unaffected.)

- [ ] **Step 13: Mutants**

```json
[
  {
    "name": "S9 trades: eviction never runs",
    "file": "packages/domain/src/simulators/TradeStoreSimulator.ts",
    "find": "while (this.trades.size > this.maxTrades) {",
    "replace": "while (false) {",
    "test": "pnpm --filter @rtc/domain test TradeStoreSimulator -t \"maxTrades\""
  },
  {
    "name": "S9 orders: evicts the newest instead of the oldest",
    "file": "packages/domain/src/simulators/EquityOrderSimulator.ts",
    "find": "this.book.shift();",
    "replace": "this.book.pop();",
    "test": "pnpm --filter @rtc/domain test EquityOrderSimulator.bounded"
  },
  {
    "name": "S9 rfqs: quotes of an evicted RFQ are kept",
    "file": "packages/domain/src/simulators/CreditRfqSimulator.ts",
    "find": "this.quotes.delete(quoteId);",
    "replace": "this.quotes.get(quoteId);",
    "test": "pnpm --filter @rtc/domain test CreditRfqSimulator.bounded"
  },
  {
    "name": "S9 rfqs: expiry timer of an evicted RFQ is neither cancelled nor forgotten",
    "file": "packages/domain/src/simulators/CreditRfqSimulator.ts",
    "find": "const timer = this.expiryTimers.get(rfqId);",
    "replace": "const timer = undefined as ReturnType<typeof setTimeout> | undefined;",
    "test": "pnpm --filter @rtc/domain test CreditRfqSimulator.bounded"
  }
]
```

- [ ] **Step 14: Commit**

```bash
git add packages/domain/src/simulators
git commit -m "feat(domain): bound the shared trade, order and RFQ stores — oldest evicted first, quotes and expiry timers go with their RFQ (S9)"
```

---

### Task 6: PR 1 docs, gauntlet, and the mutation table

**Files:**
- Modify: `packages/server/README.md` (new "Limits" subsection under "Auth" or a new `## Limits` section listing `config/limits.ts`)
- Modify: `docs/architecture/14-composition-and-wiring.md` (server composition list: `maxPayload`, the `error` listener, per-connection ceilings)
- Modify: `docs/architecture/09-test-strategy.md`? — no; nothing new in method.

- [ ] **Step 1: Document**

`packages/server/README.md`, new section after `## Auth`:

```markdown
## Limits

Every per-caller bound lives in `src/config/limits.ts` (hardening spec §2.2 /
§9.2). The values are generous for one real client and tight for a flood:

| What | Constant | Default |
|---|---|---|
| Largest WebSocket frame (`ws` closes with 1009) | `WS_MAX_PAYLOAD_BYTES` | 64 KiB |
| `jarvis.chat` message text | `JARVIS_WIRE_TEXT_MAX` (local to `jarvis.effects.ts`) | 4 000 chars |
| Live `stream()` inner streams per effect per connection | ws-effects `StreamOptions.maxActive` | 64 |
| Distinct `keyedStream()` keys per effect per connection | ws-effects `KeyedStreamOptions.maxKeys` | 128 |
| Shared blotter / order book / RFQ store size | domain simulator constructor args | 500 / 500 / 200 |

Every RPC and stream payload is validated at its parse seam
(`src/effects/guards.ts`): a malformed RPC is **nacked**, a malformed
subscribe frame is **dropped**, and in both cases the connection's other
effects keep serving (before B1 a malformed frame killed that effect for the
rest of the socket).
```

`docs/architecture/14-composition-and-wiring.md` item 5: add "`maxPayload: WS_MAX_PAYLOAD_BYTES` (S1)" and item 7: "attaches an `error` listener (a protocol-violating frame is logged by code, never thrown — S14)".

- [ ] **Step 2: Run the mutation table and the gauntlet**

```bash
pnpm --filter @rtc/ws-effects build && pnpm --filter @rtc/domain build
pnpm mutation-check "$SCRATCH/b1-pr1-mutants.json"      # expect every row KILLED; rebuild both packages again after (the restore leaves stale dist)
pnpm --filter @rtc/ws-effects build && pnpm --filter @rtc/domain build
```

Then the full local gauntlet (`/rtc:gauntlet full`) and `pnpm test:e2e`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/README.md docs/architecture/14-composition-and-wiring.md
git commit -m "docs(server): the B1 wire bounds — limits table, parse-seam validation, S14"
```

PR 1 is complete. Start PR 2 on a branch stacked on it: `git checkout -b worktree-b1-edge-guards`.

---

## PR 2 — edge guards (branch `worktree-b1-edge-guards`, stacked on PR 1)

### Task 7: cap the `/login` body by bytes received (S2) and the `/mcp` declared length

**Files:**
- Create: `packages/server/src/http/readBody.ts`
- Create: `packages/server/src/http/readBody.test.ts`
- Modify: `packages/server/src/index.ts` (use it; map the error to 413; `/mcp` length precheck)

**Interfaces:**
- Produces:
  ```ts
  export class BodyTooLargeError extends Error { readonly limit: number }
  export function readBodyWithLimit(req: Readable & { destroy(): void }, maxBytes: number): Promise<string>;
  export function declaredLengthExceeds(headers: IncomingHttpHeaders, maxBytes: number): boolean;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { BodyTooLargeError, declaredLengthExceeds, readBodyWithLimit } from "#/http/readBody";

describe("readBodyWithLimit", () => {
  it("returns the full body when under the cap", async () => {
    await expect(readBodyWithLimit(createRequest(["{\"a\":", "1}"]), 64)).resolves.toBe('{"a":1}');
  });

  it("rejects with BodyTooLargeError and destroys the request once the received bytes exceed the cap", async () => {
    const req = createRequest(["x".repeat(40), "y".repeat(40)]);
    await expect(readBodyWithLimit(req, 64)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(req.destroyed).toBe(true);
  });

  it("a body longer than its declared length is cut at the cap (Content-Length is not trusted)", async () => {
    const req = createRequest(["x".repeat(100)], { "content-length": "10" });
    await expect(readBodyWithLimit(req, 64)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("declaredLengthExceeds reads Content-Length when present and never trusts a missing one", () => {
    expect(declaredLengthExceeds({ "content-length": "65537" }, 65_536)).toBe(true);
    expect(declaredLengthExceeds({ "content-length": "10" }, 65_536)).toBe(false);
    expect(declaredLengthExceeds({}, 65_536)).toBe(false);
  });
});

function createRequest(chunks: readonly string[], headers: Record<string, string> = {}): Readable & { headers: Record<string, string> } {
  const readable = Readable.from(chunks.map((c) => { return Buffer.from(c); })) as Readable & { headers: Record<string, string> };
  readable.headers = headers;
  return readable;
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @rtc/server test readBody`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";

/** S2 — thrown by {@link readBodyWithLimit} the moment the bytes RECEIVED
 * pass `limit`; the declared `Content-Length` is advisory only. */
export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/** Reads a request body, counting bytes as they arrive; past `maxBytes` the
 * request is destroyed (so the client stops sending) and the promise
 * rejects. The resolved string is UTF-8. */
export function readBodyWithLimit(req: Readable, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    req.on("data", (chunk: Buffer): void => {
      received += chunk.length;

      if (received > maxBytes) {
        req.destroy();
        reject(new BodyTooLargeError(maxBytes));
        return;
      }

      chunks.push(chunk);
    });
    req.on("end", (): void => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

/** Cheap early rejection for routes whose body is read by someone else (the
 * MCP transport): true when the client DECLARES more than `maxBytes`. A
 * missing header is not a violation — the reader must still count. */
export function declaredLengthExceeds(headers: IncomingHttpHeaders, maxBytes: number): boolean {
  const raw = headers["content-length"];
  const declared = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(declared) && declared > maxBytes;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @rtc/server test readBody`
Expected: PASS.

- [ ] **Step 5: Wire into `index.ts`**

Replace the local `readBody` with `readBodyWithLimit(req, LOGIN_MAX_BODY_BYTES)`; in the `.catch`, map `BodyTooLargeError` to `413 { error: "body_too_large" }` and everything else to the existing 400. Before `serveMcp(req, res)`: `if (declaredLengthExceeds(req.headers, MCP_MAX_BODY_BYTES)) { res.writeHead(413, …); res.end(JSON.stringify({ error: "body_too_large" })); return; }`.

- [ ] **Step 6: Mutant**

```json
{
  "name": "S2: counts chunks instead of bytes",
  "file": "packages/server/src/http/readBody.ts",
  "find": "received += chunk.length;",
  "replace": "received += 1;",
  "test": "pnpm --filter @rtc/server test readBody"
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/http/readBody.ts packages/server/src/http/readBody.test.ts packages/server/src/index.ts
git commit -m "feat(server): cap the /login body at 4 KiB by bytes received, 413 past it; /mcp rejects an over-declared length (S2)"
```

---

### Task 8: key on the platform's trusted client IP (S3)

**Files:**
- Create: `packages/server/src/http/clientIp.ts` + `clientIp.test.ts`
- Modify: `packages/server/src/index.ts` (replace the local `clientIp`)

**Interfaces:**
- Produces:
  ```ts
  export interface ClientIpSource { readonly headers: IncomingHttpHeaders; readonly socket: { readonly remoteAddress?: string } }
  export function resolveClientIp(req: ClientIpSource, trustedHeader: string): string;   // header value, else remoteAddress, else "unknown"
  export function resolveTrustedIpHeader(env: NodeJS.ProcessEnv): string;                // RTC_TRUSTED_IP_HEADER (lower-cased) or TRUSTED_IP_HEADER_DEFAULT
  ```
  `X-Forwarded-For` is **never** consulted: its first hop is caller-supplied (spec §9.1).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { resolveClientIp, resolveTrustedIpHeader } from "#/http/clientIp";

describe("resolveClientIp", () => {
  it("prefers the trusted header, trimmed", () => {
    expect(resolveClientIp(createRequest({ "fly-client-ip": " 203.0.113.9 " }), "fly-client-ip")).toBe("203.0.113.9");
  });

  it("ignores X-Forwarded-For entirely (its first hop is caller-supplied)", () => {
    expect(resolveClientIp(createRequest({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), "fly-client-ip")).toBe("10.0.0.2");
  });

  it("falls back to the socket address, then to \"unknown\"", () => {
    expect(resolveClientIp(createRequest({}), "fly-client-ip")).toBe("10.0.0.2");
    expect(resolveClientIp({ headers: {}, socket: {} }, "fly-client-ip")).toBe("unknown");
  });

  it("takes the first value of a repeated header", () => {
    expect(resolveClientIp({ headers: { "fly-client-ip": ["203.0.113.9", "198.51.100.1"] }, socket: {} }, "fly-client-ip")).toBe("203.0.113.9");
  });
});

describe("resolveTrustedIpHeader", () => {
  it("defaults to fly-client-ip and lower-cases an override", () => {
    expect(resolveTrustedIpHeader({})).toBe("fly-client-ip");
    expect(resolveTrustedIpHeader({ RTC_TRUSTED_IP_HEADER: "CF-Connecting-IP" })).toBe("cf-connecting-ip");
    expect(resolveTrustedIpHeader({ RTC_TRUSTED_IP_HEADER: "  " })).toBe("fly-client-ip");
  });
});

function createRequest(headers: Record<string, string | string[]>): Parameters<typeof resolveClientIp>[0] {
  return { headers, socket: { remoteAddress: "10.0.0.2" } };
}
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/server test clientIp` → module not found.

- [ ] **Step 3: Implement**

```ts
import type { IncomingHttpHeaders } from "node:http";

import { TRUSTED_IP_HEADER_DEFAULT } from "../config/limits.js";

export interface ClientIpSource {
  readonly headers: IncomingHttpHeaders;
  readonly socket: { readonly remoteAddress?: string };
}

/** S3 — the rate limiter, the ban list and the connection caps all key on
 * this. Only the header the PLATFORM sets is trusted (`Fly-Client-IP`;
 * Cloudflare's `CF-Connecting-IP` via `RTC_TRUSTED_IP_HEADER` once that
 * layer exists). `X-Forwarded-For` is never read: its first entry is
 * whatever the caller put there. */
export function resolveClientIp(req: ClientIpSource, trustedHeader: string): string {
  const raw = req.headers[trustedHeader];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();

  if (trimmed) {
    return trimmed;
  }

  return req.socket.remoteAddress ?? "unknown";
}

export function resolveTrustedIpHeader(env: NodeJS.ProcessEnv): string {
  const override = env.RTC_TRUSTED_IP_HEADER?.trim().toLowerCase();
  return override ? override : TRUSTED_IP_HEADER_DEFAULT;
}
```

- [ ] **Step 4: Run tests** → PASS. Replace `clientIp(req)` in `index.ts` with `resolveClientIp(req, TRUSTED_IP_HEADER)` where `const TRUSTED_IP_HEADER = resolveTrustedIpHeader(process.env);` is computed once at startup and logged with the listen banner (`  IP:    trusting header ${TRUSTED_IP_HEADER}`).

- [ ] **Step 5: Mutant**

```json
{
  "name": "S3: falls back to X-Forwarded-For",
  "file": "packages/server/src/http/clientIp.ts",
  "find": "return req.socket.remoteAddress ?? \"unknown\";",
  "replace": "return (req.headers[\"x-forwarded-for\"] as string | undefined)?.split(\",\")[0]?.trim() ?? req.socket.remoteAddress ?? \"unknown\";",
  "test": "pnpm --filter @rtc/server test clientIp -t \"X-Forwarded-For\""
}
```

- [ ] **Step 6: Commit** — `feat(server): key every per-caller limit on the trusted Fly-Client-IP header, never X-Forwarded-For (S3)`

---

### Task 9: evict and bound the rate-limit table (S4)

**Files:**
- Modify: `packages/server/src/auth/rateLimit.ts` + `rateLimit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RateLimiterOptions { readonly maxKeys?: number }   // default RATE_LIMIT_MAX_KEYS
  export interface RateLimiter { hit(key: string, now: number): boolean; size(): number }
  export function createRateLimiter(maxPerWindow: number, windowMs: number, options?: RateLimiterOptions): RateLimiter;
  ```
  On every `hit`: expired windows are swept when the table has grown past `maxKeys / 2` since the last sweep (amortised), and when the table is still at `maxKeys` after the sweep the entry with the oldest `windowStart` is evicted.

- [ ] **Step 1: Write the failing tests**

```ts
  it("evicts expired windows so the table does not grow without bound (S4)", () => {
    const rl = createRateLimiter(1, 1_000, { maxKeys: 4 });

    for (let i = 0; i < 4; i += 1) {
      rl.hit(`ip-${i}`, 0);
    }

    expect(rl.size()).toBe(4);
    rl.hit("ip-new", 5_000);
    expect(rl.size()).toBe(1);
  });

  it("never exceeds maxKeys even when nothing has expired: the oldest window goes", () => {
    const rl = createRateLimiter(1, 1_000, { maxKeys: 2 });
    rl.hit("a", 0);
    rl.hit("b", 100);
    rl.hit("c", 200);

    expect(rl.size()).toBe(2);
    expect(rl.hit("a", 300)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure** — `size is not a function`.

- [ ] **Step 3: Implement**

```ts
import { RATE_LIMIT_MAX_KEYS } from "../config/limits.js";

export interface RateLimiterOptions {
  readonly maxKeys?: number;
}

export function createRateLimiter(maxPerWindow: number, windowMs: number, options: RateLimiterOptions = {}): RateLimiter {
  const maxKeys = options.maxKeys ?? RATE_LIMIT_MAX_KEYS;
  const windows = new Map<string, WindowState>();

  function sweepExpired(now: number): void {
    for (const [key, state] of windows) {
      if (now >= state.windowStart + windowMs) {
        windows.delete(key);
      }
    }
  }

  function evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestStart = Number.POSITIVE_INFINITY;

    for (const [key, state] of windows) {
      if (state.windowStart < oldestStart) {
        oldestStart = state.windowStart;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      windows.delete(oldestKey);
    }
  }

  return {
    hit(key: string, now: number): boolean {
      const state = windows.get(key);

      if (state === undefined || now >= state.windowStart + windowMs) {
        if (state === undefined && windows.size >= maxKeys) {
          sweepExpired(now);
        }

        if (state === undefined && windows.size >= maxKeys) {
          evictOldest();
        }

        windows.set(key, { count: 1, windowStart: now });
        return true;
      }

      if (state.count < maxPerWindow) {
        state.count++;
        return true;
      }

      return false;
    },
    size(): number {
      return windows.size;
    },
  };
}
```

(Sweeping only when the table is full keeps the hot path O(1); a full sweep is O(n) once per `maxKeys` insertions at worst.)

- [ ] **Step 4: Run** — PASS, including the three existing cases.

- [ ] **Step 5: Mutant**

```json
{
  "name": "S4: eviction skipped when full",
  "file": "packages/server/src/auth/rateLimit.ts",
  "find": "if (state === undefined && windows.size >= maxKeys) {\n          evictOldest();",
  "replace": "if (false) {\n          evictOldest();",
  "test": "pnpm --filter @rtc/server test rateLimit -t \"never exceeds maxKeys\""
}
```

(`find` must match once; if the two `if` lines are not adjacent exactly like that in the final file, pick the `evictOldest();` call line and replace it with `void 0;`.)

- [ ] **Step 6: Commit** — `feat(server): the login rate limiter evicts expired windows and bounds its table (S4)`

---

### Task 10: the expiring ban list (§9.2)

**Files:**
- Create: `packages/server/src/auth/banList.ts` + `banList.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StrikeReason = "login-failed" | "login-rate-limited" | "frame-too-large" | "message-flood";
  export interface BanListOptions { readonly strikesToBan: number; readonly strikeWindowMs: number; readonly banMs: number; readonly maxEntries: number; readonly onBan?: (ip: string, untilMs: number, reason: StrikeReason) => void }
  export interface BanList {
    strike(ip: string, reason: StrikeReason, now: number): boolean;   // true when this strike banned the ip
    isBanned(ip: string, now: number): boolean;
    bannedUntil(ip: string, now: number): number | null;
    size(): number;
  }
  export function createBanList(options: BanListOptions): BanList;
  export const STRIKE_WEIGHT: Readonly<Record<StrikeReason, number>>; // login-failed 1, login-rate-limited 2, frame-too-large 3, message-flood 3
  ```
  Semantics: strikes within `strikeWindowMs` of the first strike accumulate (weighted); reaching `strikesToBan` sets `bannedUntil = now + banMs` and clears the strike count. A banned IP's further strikes are ignored (no extension). Expired bans and stale strike windows are swept when the table is full; when still full, the entry with the smallest `bannedUntil`/`windowStart` is evicted. `onBan` is the logging slot.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";

import { createBanList } from "#/auth/banList";

describe("banList", () => {
  it("bans after strikesToBan weighted strikes inside the window, and reports it once", () => {
    const onBan = vi.fn();
    const bans = createBanList(createOptions({ onBan }));

    expect(bans.strike("1.2.3.4", "login-failed", 0)).toBe(false);
    expect(bans.strike("1.2.3.4", "login-failed", 10)).toBe(false);
    expect(bans.strike("1.2.3.4", "frame-too-large", 20)).toBe(true);
    expect(bans.isBanned("1.2.3.4", 21)).toBe(true);
    expect(bans.bannedUntil("1.2.3.4", 21)).toBe(20 + 15 * 60_000);
    expect(onBan).toHaveBeenCalledTimes(1);
    expect(onBan).toHaveBeenCalledWith("1.2.3.4", 20 + 15 * 60_000, "frame-too-large");
  });

  it("forgets strikes once the window has passed", () => {
    const bans = createBanList(createOptions());
    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);
    expect(bans.strike("1.2.3.4", "login-failed", 10 * 60_000 + 1)).toBe(false);
    expect(bans.isBanned("1.2.3.4", 10 * 60_000 + 2)).toBe(false);
  });

  it("lifts the ban when it expires and does not extend it on further strikes", () => {
    const bans = createBanList(createOptions({ strikesToBan: 1 }));
    bans.strike("1.2.3.4", "login-failed", 0);
    expect(bans.strike("1.2.3.4", "login-failed", 1)).toBe(false);
    expect(bans.bannedUntil("1.2.3.4", 1)).toBe(15 * 60_000);
    expect(bans.isBanned("1.2.3.4", 15 * 60_000)).toBe(false);
  });

  it("bounds the table: expired entries are swept, then the oldest goes", () => {
    const bans = createBanList(createOptions({ maxEntries: 2, strikesToBan: 1 }));
    bans.strike("a", "login-failed", 0);
    bans.strike("b", "login-failed", 1);
    bans.strike("c", "login-failed", 2);
    expect(bans.size()).toBe(2);
    expect(bans.isBanned("a", 3)).toBe(false);
    expect(bans.isBanned("c", 3)).toBe(true);
  });
});

function createOptions(overrides: Partial<Parameters<typeof createBanList>[0]> = {}): Parameters<typeof createBanList>[0] {
  return {
    strikesToBan: 5,
    strikeWindowMs: 10 * 60_000,
    banMs: 15 * 60_000,
    maxEntries: 100,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
export type StrikeReason = "login-failed" | "login-rate-limited" | "frame-too-large" | "message-flood";

/** How much each kind of misbehaviour counts. A wrong password is cheap
 * and human; an oversized frame or a flood is scripted. */
export const STRIKE_WEIGHT: Readonly<Record<StrikeReason, number>> = {
  "login-failed": 1,
  "login-rate-limited": 2,
  "frame-too-large": 3,
  "message-flood": 3,
};

export interface BanListOptions {
  readonly strikesToBan: number;
  readonly strikeWindowMs: number;
  readonly banMs: number;
  readonly maxEntries: number;
  readonly onBan?: (ip: string, untilMs: number, reason: StrikeReason) => void;
}

export interface BanList {
  /** Records one strike; returns true when THIS strike crossed the threshold. */
  strike(ip: string, reason: StrikeReason, now: number): boolean;
  isBanned(ip: string, now: number): boolean;
  bannedUntil(ip: string, now: number): number | null;
  size(): number;
}

interface Entry {
  strikes: number;
  windowStart: number;
  bannedUntil: number;
}

/**
 * §9.2 — the in-app expiring ban table, checked FIRST at both edges (before
 * the scrypt hash on `/login`, before token verification on the upgrade) so
 * a banned caller costs a Map lookup. In-memory by design: a restart clears
 * it, which is fine for temporary bans.
 */
export function createBanList(options: BanListOptions): BanList {
  const entries = new Map<string, Entry>();

  function isLive(entry: Entry, now: number): boolean {
    return entry.bannedUntil > now || now < entry.windowStart + options.strikeWindowMs;
  }

  function sweep(now: number): void {
    for (const [ip, entry] of entries) {
      if (!isLive(entry, now)) {
        entries.delete(ip);
      }
    }
  }

  function evictOldest(): void {
    let oldest: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;

    for (const [ip, entry] of entries) {
      const at = Math.max(entry.bannedUntil, entry.windowStart);

      if (at < oldestAt) {
        oldestAt = at;
        oldest = ip;
      }
    }

    if (oldest !== undefined) {
      entries.delete(oldest);
    }
  }

  function bannedUntil(ip: string, now: number): number | null {
    const entry = entries.get(ip);
    return entry !== undefined && entry.bannedUntil > now ? entry.bannedUntil : null;
  }

  return {
    strike(ip: string, reason: StrikeReason, now: number): boolean {
      if (bannedUntil(ip, now) !== null) {
        return false;
      }

      let entry = entries.get(ip);

      if (entry === undefined || now >= entry.windowStart + options.strikeWindowMs) {
        if (entry === undefined && entries.size >= options.maxEntries) {
          sweep(now);
        }

        if (entry === undefined && entries.size >= options.maxEntries) {
          evictOldest();
        }

        entry = { strikes: 0, windowStart: now, bannedUntil: 0 };
        entries.set(ip, entry);
      }

      entry.strikes += STRIKE_WEIGHT[reason];

      if (entry.strikes < options.strikesToBan) {
        return false;
      }

      entry.strikes = 0;
      entry.bannedUntil = now + options.banMs;
      options.onBan?.(ip, entry.bannedUntil, reason);
      return true;
    },
    isBanned(ip: string, now: number): boolean {
      return bannedUntil(ip, now) !== null;
    },
    bannedUntil,
    size(): number {
      return entries.size;
    },
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Mutants**

```json
[
  {
    "name": "ban list: window never resets (old strikes count forever)",
    "file": "packages/server/src/auth/banList.ts",
    "find": "if (entry === undefined || now >= entry.windowStart + options.strikeWindowMs) {",
    "replace": "if (entry === undefined) {",
    "test": "pnpm --filter @rtc/server test banList -t \"forgets strikes\""
  },
  {
    "name": "ban list: ban never expires",
    "file": "packages/server/src/auth/banList.ts",
    "find": "entry.bannedUntil > now ? entry.bannedUntil : null",
    "replace": "entry.bannedUntil > 0 ? entry.bannedUntil : null",
    "test": "pnpm --filter @rtc/server test banList -t \"lifts the ban\""
  }
]
```

- [ ] **Step 6: Commit** — `feat(server): expiring, bounded ban list keyed by client IP — weighted strikes, 15-minute bans (§9.2)`

---

### Task 11: async scrypt (S5) and the ban list on `/login`

**Files:**
- Modify: `packages/server/src/auth/AuthService.ts` + `AuthService.test.ts`
- Modify: `packages/server/src/http/loginHandler.ts` + `loginHandler.test.ts`
- Modify: `packages/server/src/mcp/mcpHttpHandler.ts` only if it calls `auth.login` (it calls `verifyToken`, which stays sync — verify with grep)
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Changes:
  ```ts
  // AuthService
  login(username: string, password: string): Promise<LoginResult | null>;   // was sync
  // loginHandler
  export interface LoginHandlerDeps { auth; rateLimit; banList: BanList; now }
  export interface LoginHandlerResult { status: 200 | 400 | 401 | 429; body; headers? }   // 429 now also for "banned", with Retry-After
  export function authenticateLoginRequest(bodyText, ip, deps): Promise<LoginHandlerResult>;
  ```
  Order inside `authenticateLoginRequest`: **ban check** → rate limit (a 429 here is a `login-rate-limited` strike) → parse → `await auth.login` (a 401 is a `login-failed` strike) → 200.

- [ ] **Step 1: Write the failing AuthService test**

`AuthService.test.ts` builds one shared `svc` (declared below the cases, newspaper order) and calls `svc.login(...)` synchronously. Change every call site to `await svc.login(...)` (those tests become `async`) and add:

```ts
  it("does not block the event loop while hashing: an immediate fires during login (S5)", async () => {
    let ticked = false;
    setImmediate(() => {
      ticked = true;
    });

    await svc.login("demo", "localpass");

    expect(ticked).toBe(true);
  });
```

(This is the one real-timer wait the test-strategy allows: a single earlier-deadline `setImmediate`. With `scryptSync` the immediate cannot run before `login` returns, so the test is RED on the sync implementation.)

- [ ] **Step 2: Run** — `pnpm --filter @rtc/server test AuthService` → the new case FAILS (`ticked` false), the converted cases pass.

- [ ] **Step 3: Implement**

```ts
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/** Startup only: the table is built synchronously once from `AUTH_USERS`. */
function hashPasswordSync(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH);
}

/** S5 — every login hashes off the event loop (libuv threadpool), so a
 * burst of logins no longer stalls every live WebSocket's ticks. */
function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Promise<Buffer>;
}
```

`login` becomes `async` and `const candidate = await hashPassword(password, record.salt);`. Keep the "unknown username returns `null` immediately" shape — but hash against a fixed dummy salt first so unknown and known usernames take the same time (the spec's low-impact note):

```ts
  private readonly dummySalt = randomBytes(SALT_LENGTH);

  async login(username: string, password: string): Promise<LoginResult | null> {
    const record = this.table.get(username);
    const candidate = await hashPassword(password, record?.salt ?? this.dummySalt);

    if (!record || candidate.length !== record.digest.length || !timingSafeEqual(candidate, record.digest)) {
      return null;
    }
    /* unchanged from here */
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Write the failing loginHandler tests**

Convert the file's cases to `await authenticateLoginRequest(...)` and extend `deps` with `banList: createBanList({ strikesToBan: 100, strikeWindowMs: 60_000, banMs: 60_000, maxEntries: 10 })`. Add:

```ts
  it("answers 429 with Retry-After for a banned IP without ever calling auth.login (Review Focus 4)", async () => {
    const auth = createAuth(createClock(1_000));
    const loginSpy = vi.spyOn(auth, "login");
    const banList = createBanList({ strikesToBan: 1, strikeWindowMs: 60_000, banMs: 30_000, maxEntries: 10 });
    banList.strike("1.2.3.4", "login-failed", 500);
    const deps = createDeps(auth, { banList, now: createClock(1_000) });

    const result = await authenticateLoginRequest(createLoginBody("demo", "localpass"), "1.2.3.4", deps);

    expect(result.status).toBe(429);
    expect(result.headers?.["Retry-After"]).toBe("30");
    expect(JSON.parse(result.body)).toEqual({ error: "banned" });
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("a failed login and a rate-limited attempt each count as a strike", async () => {
    const auth = createAuth(createClock(1_000));
    const banList = createBanList({ strikesToBan: 3, strikeWindowMs: 60_000, banMs: 30_000, maxEntries: 10 });
    const deps = createDeps(auth, { banList, rateLimit: createRateLimiter(1, 60_000) });

    expect((await authenticateLoginRequest(createLoginBody("demo", "wrong"), "1.2.3.4", deps)).status).toBe(401);
    expect((await authenticateLoginRequest(createLoginBody("demo", "wrong"), "1.2.3.4", deps)).status).toBe(429);
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(true);
  });
```

(`createDeps`, `createClock`, `createLoginBody` are small factories to add under the cases; `createAuth` already exists in the file.)

- [ ] **Step 6: Run** — new cases FAIL (`banList` unknown; `login` not awaited).

- [ ] **Step 7: Implement**

```ts
export async function authenticateLoginRequest(bodyText: string, ip: string, deps: LoginHandlerDeps): Promise<LoginHandlerResult> {
  const now = deps.now();
  const bannedUntil = deps.banList.bannedUntil(ip, now);

  if (bannedUntil !== null) {
    return jsonResult(429, { error: "banned" }, { "Retry-After": String(Math.ceil((bannedUntil - now) / 1_000)) });
  }

  if (!deps.rateLimit.hit(ip, now)) {
    deps.banList.strike(ip, "login-rate-limited", now);
    return jsonResult(429, { error: "rate_limited" });
  }

  /* parse unchanged */

  const result = await deps.auth.login(parsed.username, parsed.password);

  if (result === null) {
    deps.banList.strike(ip, "login-failed", now);
    return jsonResult(401, { error: "invalid_credentials" });
  }
  /* 200 unchanged */
}
```

`jsonResult` gains an optional `extraHeaders` parameter merged over `JSON_CORS_HEADERS`. In `index.ts`, construct `const banList = createBanList({ strikesToBan: BAN_STRIKES, strikeWindowMs: BAN_STRIKE_WINDOW_MS, banMs: BAN_DURATION_MS, maxEntries: BAN_MAX_ENTRIES, onBan: (ip, until, reason) => { console.log(`[auth] ${new Date().toISOString()} ban ip=${ip} reason=${reason} until=${new Date(until).toISOString()}`); } })` and pass it; `.then(bodyText => authenticateLoginRequest(...))` already returns a promise, so the chain just flattens.

- [ ] **Step 8: Run all server tests** → PASS.

- [ ] **Step 9: Mutant**

```json
{
  "name": "S5/§9.2: ban check moved after the hash (banned callers still cost scrypt)",
  "file": "packages/server/src/http/loginHandler.ts",
  "find": "const bannedUntil = deps.banList.bannedUntil(ip, now);",
  "replace": "const bannedUntil = null as number | null;",
  "test": "pnpm --filter @rtc/server test loginHandler -t \"banned IP\""
}
```

- [ ] **Step 10: Commit** — `feat(server): async scrypt with constant-time unknown-user path, ban check before the hash (S5, §9.2)`

---

### Task 12: the upgrade gate — ban list + per-IP/total connection caps (S8 part a)

**Files:**
- Create: `packages/server/src/socket/connectionGuard.ts` + `connectionGuard.test.ts`
- Create: `packages/server/src/http/upgradeGate.ts` + `upgradeGate.test.ts`
- Modify: `packages/server/src/http/loginHandler.ts` (`UpgradeRejection` union widened)
- Modify: `packages/server/src/observability/connectionLog.ts` (no code change; the type widens)
- Modify: `packages/server/src/index.ts` (`verifyClient` callback form; acquire/release)

**Interfaces:**
- Produces:
  ```ts
  // connectionGuard.ts
  export interface ConnectionGuard { canAccept(ip: string): "ok" | "too-many-connections" | "too-many-from-ip"; acquire(ip: string): void; release(ip: string): void; total(): number }
  export function createConnectionGuard(limits: { readonly maxTotal: number; readonly maxPerIp: number }): ConnectionGuard;
  // loginHandler.ts
  export type UpgradeRejection = "no-url" | "no-token" | "invalid-token" | "banned" | "too-many-connections" | "too-many-from-ip";
  // upgradeGate.ts
  export interface UpgradeGateDeps { readonly auth: AuthService; readonly banList: BanList; readonly connections: ConnectionGuard; readonly now: () => number }
  export interface UpgradeVerdict { readonly ok: boolean; readonly status: 200 | 401 | 429 | 503; readonly reason?: UpgradeRejection }
  export function decideUpgrade(url: string | undefined, ip: string, deps: UpgradeGateDeps): UpgradeVerdict;
  ```
  Order: ban (429) → connection caps (503) → token (401). Counting: `canAccept` in `verifyClient` (a check), `acquire` on `connection`, `release` on `close` — so a handshake that never completes cannot leak a slot.

- [ ] **Step 1: Write the failing connectionGuard tests**

```ts
import { describe, expect, it } from "vitest";

import { createConnectionGuard } from "#/socket/connectionGuard";

describe("connectionGuard", () => {
  it("refuses the (maxPerIp + 1)th socket from one IP while another IP is still welcome", () => {
    const guard = createConnectionGuard({ maxTotal: 10, maxPerIp: 2 });
    guard.acquire("a");
    guard.acquire("a");

    expect(guard.canAccept("a")).toBe("too-many-from-ip");
    expect(guard.canAccept("b")).toBe("ok");
  });

  it("refuses everyone at maxTotal and welcomes again after a release", () => {
    const guard = createConnectionGuard({ maxTotal: 2, maxPerIp: 5 });
    guard.acquire("a");
    guard.acquire("b");

    expect(guard.canAccept("c")).toBe("too-many-connections");
    guard.release("a");
    expect(guard.canAccept("c")).toBe("ok");
    expect(guard.total()).toBe(1);
  });

  it("a release for an unknown IP is a no-op and never goes negative", () => {
    const guard = createConnectionGuard({ maxTotal: 2, maxPerIp: 5 });
    guard.release("ghost");
    expect(guard.total()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
export type AcceptVerdict = "ok" | "too-many-connections" | "too-many-from-ip";

export interface ConnectionGuard {
  canAccept(ip: string): AcceptVerdict;
  acquire(ip: string): void;
  release(ip: string): void;
  total(): number;
}

/** S8 — live-socket caps. `canAccept` is a CHECK (used in `verifyClient`,
 * before the handshake); `acquire`/`release` bracket the socket's real
 * lifetime (`connection` → `close`), so an upgrade that passes the check
 * but never completes its handshake holds no slot. Two concurrent upgrades
 * can both pass the check — one extra socket, not a leak. */
export function createConnectionGuard(limits: { readonly maxTotal: number; readonly maxPerIp: number }): ConnectionGuard {
  const perIp = new Map<string, number>();
  let live = 0;

  return {
    canAccept(ip: string): AcceptVerdict {
      if (live >= limits.maxTotal) {
        return "too-many-connections";
      }

      if ((perIp.get(ip) ?? 0) >= limits.maxPerIp) {
        return "too-many-from-ip";
      }

      return "ok";
    },
    acquire(ip: string): void {
      live += 1;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    },
    release(ip: string): void {
      const count = perIp.get(ip);

      if (count === undefined) {
        return;
      }

      live = Math.max(0, live - 1);

      if (count <= 1) {
        perIp.delete(ip);
      } else {
        perIp.set(ip, count - 1);
      }
    },
    total(): number {
      return live;
    },
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Write the failing upgradeGate tests (Review Focus 4)**

```ts
import { describe, expect, it, vi } from "vitest";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";
import { createBanList } from "#/auth/banList";
import { decideUpgrade } from "#/http/upgradeGate";
import { createConnectionGuard } from "#/socket/connectionGuard";

describe("decideUpgrade", () => {
  it("accepts a valid token from an unbanned IP with free capacity", () => {
    const deps = createDeps();
    const url = `/?access=${createToken(deps.auth)}`;

    expect(decideUpgrade(url, "1.2.3.4", deps)).toEqual({ ok: true, status: 200 });
  });

  it("rejects a banned IP with 429 before looking at the token", () => {
    const deps = createDeps();
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    const verify = vi.spyOn(deps.auth, "verifyToken");

    expect(decideUpgrade(`/?access=${createToken(deps.auth)}`, "1.2.3.4", deps)).toEqual({ ok: false, status: 429, reason: "banned" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects with 503 when the connection caps are hit, naming which", () => {
    const deps = createDeps({ maxPerIp: 1 });
    deps.connections.acquire("1.2.3.4");

    expect(decideUpgrade(`/?access=${createToken(deps.auth)}`, "1.2.3.4", deps)).toEqual({ ok: false, status: 503, reason: "too-many-from-ip" });
  });

  it("rejects a missing or bad token with 401 and the existing reasons", () => {
    const deps = createDeps();

    expect(decideUpgrade("/", "1.2.3.4", deps)).toEqual({ ok: false, status: 401, reason: "no-token" });
    expect(decideUpgrade("/?access=nope", "1.2.3.4", deps)).toEqual({ ok: false, status: 401, reason: "invalid-token" });
    expect(decideUpgrade(undefined, "1.2.3.4", deps)).toEqual({ ok: false, status: 401, reason: "no-url" });
  });
});

interface Deps {
  readonly auth: AuthService;
  readonly banList: ReturnType<typeof createBanList>;
  readonly connections: ReturnType<typeof createConnectionGuard>;
  readonly now: () => number;
}

function createDeps(limits: { maxPerIp?: number; maxTotal?: number } = {}): Deps {
  return {
    auth: new AuthService({ secret: "s", ttlMs: 60_000, credentials: parseAuthUsers("demo:pw"), now: (): number => { return 1_000; } }),
    banList: createBanList({ strikesToBan: 5, strikeWindowMs: 60_000, banMs: 60_000, maxEntries: 10 }),
    connections: createConnectionGuard({ maxTotal: limits.maxTotal ?? 10, maxPerIp: limits.maxPerIp ?? 10 }),
    now: (): number => {
      return 1_000;
    },
  };
}

function createToken(auth: AuthService): string {
  // signToken is reachable through a successful login; a sync helper keeps
  // the gate tests timer-free — use the token module directly:
  return signToken("demo", "s", 60_000, 1_000);
}
```

(Import `signToken` from `#/auth/token`.)

- [ ] **Step 6: Run to verify failure** — module not found.

- [ ] **Step 7: Implement**

Widen the union in `loginHandler.ts`:

```ts
export type UpgradeRejection = "no-url" | "no-token" | "invalid-token" | "banned" | "too-many-connections" | "too-many-from-ip";
```

`upgradeGate.ts`:

```ts
import type { AuthService } from "../auth/AuthService.js";
import type { BanList } from "../auth/banList.js";
import type { ConnectionGuard } from "../socket/connectionGuard.js";
import { describeUpgrade, type UpgradeRejection } from "./loginHandler.js";

export interface UpgradeGateDeps {
  readonly auth: AuthService;
  readonly banList: BanList;
  readonly connections: ConnectionGuard;
  readonly now: () => number;
}

export interface UpgradeVerdict {
  readonly ok: boolean;
  readonly status: 200 | 401 | 429 | 503;
  readonly reason?: UpgradeRejection;
}

/** The whole upgrade decision, cheapest check first: a banned IP costs a Map
 * lookup, a capped IP costs two, and only then is the token verified. */
export function decideUpgrade(url: string | undefined, ip: string, deps: UpgradeGateDeps): UpgradeVerdict {
  if (deps.banList.isBanned(ip, deps.now())) {
    return { ok: false, status: 429, reason: "banned" };
  }

  const capacity = deps.connections.canAccept(ip);

  if (capacity !== "ok") {
    return { ok: false, status: 503, reason: capacity };
  }

  const decision = describeUpgrade(url, deps.auth);

  if (!decision.ok) {
    return { ok: false, status: 401, reason: decision.reason };
  }

  return { ok: true, status: 200 };
}
```

- [ ] **Step 8: Wire `index.ts`** — the callback form of `verifyClient`, and acquire/release:

```ts
const connections = createConnectionGuard({ maxTotal: MAX_CONNECTIONS_TOTAL, maxPerIp: MAX_CONNECTIONS_PER_IP });
const gateDeps: UpgradeGateDeps = { auth, banList, connections, now: (): number => { return Date.now(); } };

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  verifyClient: (info: Parameters<VerifyClientCallbackAsync>[0], done: Parameters<VerifyClientCallbackAsync>[1]): void => {
    const verdict = decideUpgrade(info.req.url, resolveClientIp(info.req, TRUSTED_IP_HEADER), gateDeps);

    if (!verdict.ok && verdict.reason) {
      connectionLog.recordRejectedUpgrade(verdict.reason);
    }

    done(verdict.ok, verdict.status, verdict.ok ? undefined : verdict.reason);
  },
});

wss.on("connection", (ws, req) => {
  const ip = resolveClientIp(req, TRUSTED_IP_HEADER);
  connections.acquire(ip);
  connectionLog.recordConnect();
  ws.on("error", (err: Error & CodedError) => {
    connectionLog.recordSocketError(err.code ?? err.name);

    if (err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
      banList.strike(ip, "frame-too-large", Date.now());
    }
  });
  ws.on("close", () => {
    connections.release(ip);
    connectionLog.recordDisconnect();
  });
  listen(toSocket(ws /* Task 13 adds options here */));
});
```

(`VerifyClientCallbackAsync` is exported by `@types/ws`; the existing `VerifyClientCallbackSync` import goes.)

- [ ] **Step 9: Run** — `pnpm --filter @rtc/server test && pnpm --filter @rtc/server typecheck` → PASS.

- [ ] **Step 10: Mutant**

```json
{
  "name": "upgrade gate: ban checked after the token (banned callers cost a verify)",
  "file": "packages/server/src/http/upgradeGate.ts",
  "find": "if (deps.banList.isBanned(ip, deps.now())) {",
  "replace": "if (false) {",
  "test": "pnpm --filter @rtc/server test upgradeGate -t \"banned IP\""
}
```

- [ ] **Step 11: Commit** — `feat(server): upgrade gate — ban list first, per-IP and total connection caps, then the token (S8, §9.2)`

---

### Task 13: per-socket inbound token bucket (S8 part b)

**Files:**
- Create: `packages/server/src/socket/tokenBucket.ts` + `tokenBucket.test.ts`
- Modify: `packages/server/src/socket/toSocket.ts` + `toSocket.test.ts`
- Modify: `packages/server/src/socket/FakeWs.testHelpers.ts` (`close(code, reason)` records the close)
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  // tokenBucket.ts
  export interface TokenBucket { tryTake(now: number): boolean }
  export function createTokenBucket(burst: number, refillPerSecond: number): TokenBucket;
  // toSocket.ts
  export interface InboundGuardOptions { readonly bucket: TokenBucket; readonly dropsBeforeClose: number; readonly now: () => number; readonly onFlood: () => void }
  export function toSocket(ws: WebSocket, guard?: InboundGuardOptions): Socket;
  ```
  Behaviour: each parsed frame takes one token; without a token the frame is **dropped** (not emitted) and a drop counter increments; at `dropsBeforeClose` the socket is closed with `1008 "message rate exceeded"` and `onFlood()` fires once (the caller strikes the ban list). Without a `guard` argument `toSocket` behaves exactly as today (every existing test keeps passing).

- [ ] **Step 1: Write the failing bucket tests**

```ts
import { describe, expect, it } from "vitest";

import { createTokenBucket } from "#/socket/tokenBucket";

describe("tokenBucket", () => {
  it("allows burst tokens at once, then refuses", () => {
    const bucket = createTokenBucket(3, 1);
    expect([bucket.tryTake(0), bucket.tryTake(0), bucket.tryTake(0), bucket.tryTake(0)]).toEqual([true, true, true, false]);
  });

  it("refills at refillPerSecond, capped at burst", () => {
    const bucket = createTokenBucket(2, 10);
    bucket.tryTake(0);
    bucket.tryTake(0);
    expect(bucket.tryTake(50)).toBe(false);
    expect(bucket.tryTake(100)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
export interface TokenBucket {
  /** Takes one token if available at `now` (ms). */
  tryTake(now: number): boolean;
}

/** S8 — a classic token bucket: `burst` tokens to start, refilled
 * continuously at `refillPerSecond`, never above `burst`. Time is injected
 * so tests need no timers. */
export function createTokenBucket(burst: number, refillPerSecond: number): TokenBucket {
  let tokens = burst;
  let lastAt: number | undefined;

  return {
    tryTake(now: number): boolean {
      if (lastAt !== undefined && now > lastAt) {
        tokens = Math.min(burst, tokens + ((now - lastAt) / 1_000) * refillPerSecond);
      }

      lastAt = now;

      if (tokens < 1) {
        return false;
      }

      tokens -= 1;
      return true;
    },
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Write the failing toSocket guard test**

Extend `FakeWs` with a recorded close:

```ts
  closedWith: { code: number; reason: string } | undefined;

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.closeConnection();
  }
```

Append to `toSocket.test.ts`:

```ts
  it("drops frames once the bucket is empty, closes with 1008 after dropsBeforeClose drops, and reports the flood once (S8)", () => {
    const ws = new FakeWs();
    const onFlood = vi.fn();
    const socket = toSocket(ws as unknown as import("ws").WebSocket, {
      bucket: createTokenBucket(2, 0),
      dropsBeforeClose: 3,
      now: (): number => {
        return 0;
      },
      onFlood,
    });
    const received: unknown[] = [];
    socket.messages$.subscribe((msg: unknown) => {
      received.push(msg);
    });

    for (let i = 0; i < 5; i += 1) {
      ws.receive({ type: "ping", payload: i });
    }

    expect(received).toHaveLength(2);
    expect(ws.closedWith).toEqual({ code: 1008, reason: "message rate exceeded" });
    expect(onFlood).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 6: Run to verify failure** — `toSocket` ignores the second argument; five frames received.

- [ ] **Step 7: Implement**

```ts
export interface InboundGuardOptions {
  readonly bucket: TokenBucket;
  readonly dropsBeforeClose: number;
  readonly now: () => number;
  /** Fired once, when the socket is closed for flooding. */
  readonly onFlood: () => void;
}

export function toSocket(ws: WebSocket, guard?: InboundGuardOptions): Socket {
  let drops = 0;
  let flooded = false;

  const messages$ = new Observable<Inbound>((subscriber) => {
    function emitParsedFrame(data: unknown): void {
      if (guard !== undefined && !guard.bucket.tryTake(guard.now())) {
        drops += 1;

        if (drops >= guard.dropsBeforeClose && !flooded) {
          flooded = true;
          guard.onFlood();
          ws.close(1008, "message rate exceeded");
        }

        return;
      }

      try {
        subscriber.next(JSON.parse(String(data)) as Inbound);
      } catch {
        // ignore unparseable frames (parity with the old handler)
      }
    }
    /* rest unchanged */
```

- [ ] **Step 8: Wire `index.ts`**

```ts
  listen(
    toSocket(ws, {
      bucket: createTokenBucket(INBOUND_BURST, INBOUND_REFILL_PER_SECOND),
      dropsBeforeClose: INBOUND_DROPS_BEFORE_CLOSE,
      now: (): number => {
        return Date.now();
      },
      onFlood: (): void => {
        banList.strike(ip, "message-flood", Date.now());
      },
    }),
  );
```

- [ ] **Step 9: Run** — `pnpm --filter @rtc/server test` → PASS.

- [ ] **Step 10: Mutants**

```json
[
  {
    "name": "S8b bucket: refill ignores elapsed time",
    "file": "packages/server/src/socket/tokenBucket.ts",
    "find": "((now - lastAt) / 1_000) * refillPerSecond",
    "replace": "refillPerSecond",
    "test": "pnpm --filter @rtc/server test tokenBucket -t \"refills\""
  },
  {
    "name": "S8b toSocket: dropped frames still delivered",
    "file": "packages/server/src/socket/toSocket.ts",
    "find": "        return;\n      }\n\n      try {",
    "replace": "      }\n\n      try {",
    "test": "pnpm --filter @rtc/server test toSocket -t \"drops frames\""
  }
]
```

- [ ] **Step 11: Commit** — `feat(server): per-socket inbound token bucket — drop past the burst, close 1008 and strike after 100 drops (S8)`

---

### Task 14: `SET_THROUGHPUT` becomes per-connection (S10)

**Files:**
- Create: `packages/server/src/services/connectionScope.ts` + `connectionScope.test.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  /** The shared services plus the one per-connection service: a fresh ThroughputService. */
  export function scopeServicesToConnection(shared: ServiceContainer): ServiceContainer;
  ```
  Nothing on the server reads `throughput` except the two admin RPCs (verified: `grep -rn "throughput\." packages/server/src` → only `admin.effects.ts`), so a per-connection instance changes nobody else's view. `Ctx` stays `ServiceContainer`; zero test churn.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { scopeServicesToConnection } from "#/services/connectionScope";
import { createServices } from "#/services/serviceContainer";

describe("scopeServicesToConnection", () => {
  it("gives each connection its own throughput while sharing every simulator (S10)", () => {
    const shared = createServices({});
    const a = scopeServicesToConnection(shared);
    const b = scopeServicesToConnection(shared);

    a.throughput.setThroughput(900);

    expect(b.throughput.getThroughput()).toBe(100);
    expect(shared.throughput.getThroughput()).toBe(100);
    expect(a.pricing).toBe(shared.pricing);
    expect(a.blotter).toBe(shared.blotter);
    expect(a.usageMeter).toBe(shared.usageMeter);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ServiceContainer } from "./serviceContainer.js";
import { ThroughputService } from "./ThroughputService.js";

/** S10 — `SET_THROUGHPUT` used to change one process-wide value that every
 * login could set. Nothing on the server consumes it except the two admin
 * RPCs that read it back, so the honest fix is to scope it: each socket
 * gets its own `ThroughputService`, and the simulators stay shared. */
export function scopeServicesToConnection(shared: ServiceContainer): ServiceContainer {
  return { ...shared, throughput: new ThroughputService() };
}
```

- [ ] **Step 4: Wire `index.ts`** — replace the module-level `listen` with the effect, and build the listener per connection:

```ts
const effect = combineEffects(...buildEffects(jarvisLoops));
// …in the connection handler:
  createWsListener(effect, scopeServicesToConnection(services))(toSocket(ws, { /* Task 13 */ }));
```

- [ ] **Step 5: Run** — `pnpm --filter @rtc/server test && pnpm --filter @rtc/server typecheck` → PASS. The node smoke's throughput round-trip (`get → set 250 → get`) still passes because it runs on one socket.

- [ ] **Step 6: Mutant**

```json
{
  "name": "S10: throughput still shared",
  "file": "packages/server/src/services/connectionScope.ts",
  "find": "return { ...shared, throughput: new ThroughputService() };",
  "replace": "return { ...shared };",
  "test": "pnpm --filter @rtc/server test connectionScope"
}
```

- [ ] **Step 7: Commit** — `feat(server): SET_THROUGHPUT is per-connection — one login can no longer change it for everyone (S10)`

---

### Task 15: real-server witnesses for the edge guards

**Files:**
- Modify: `tests/fullstack/node-smoke.ts`

Three cheap checks against the already-running smoke server, added as `runEdgeGuardSmoke()` and called after `runOversizedFrameSmoke()`:

- [ ] **Step 1: Add the witnesses**

```ts
/** S2/S3/S8 witnesses over the real HTTP + WS edge. */
async function runEdgeGuardSmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;

  // S2 — a 5 KiB login body is refused with 413 before it is parsed.
  const big = await fetch(`${httpBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "x".repeat(5 * 1024) }),
  });
  assert(big.status === 413, `oversized login body status (got ${big.status})`);

  // S3 — a spoofed X-Forwarded-For does not give the caller a fresh rate-limit
  // bucket: 10 failed logins from this socket, each claiming a new forwarded
  // IP, still end in 429 on the 11th.
  for (let i = 0; i < 10; i += 1) {
    await fetch(`${httpBase}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${i}` },
      body: JSON.stringify({ username: "demo", password: "wrong" }),
    });
  }
  const eleventh = await fetch(`${httpBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.99" },
    body: JSON.stringify({ username: "demo", password: "demo" }),
  });
  assert(eleventh.status === 429, `spoofed X-Forwarded-For still rate-limited (got ${eleventh.status})`);
  console.log("  ✓ edge: 413 on a 5 KiB login body; X-Forwarded-For cannot dodge the rate limit");
}
```

The ban list will now have 10 `login-failed` strikes for 127.0.0.1 — exactly `BAN_STRIKES` — so this smoke must run **last** among the checks on `PORT` (after `runChecks`, which needs a successful login), and `runGateSmoke` uses its own server on `GATED_PORT`, unaffected. Put the call order in `main` as: `runChecks` → `runOversizedFrameSmoke` → `runEdgeGuardSmoke` → `runGateSmoke`. Add a final assertion that the ban took: a 12th request returns `429` with body `{"error":"banned"}` and a `Retry-After` header — the §9.2 witness over the real wire.

- [ ] **Step 2: Run** — `pnpm --filter @rtc/tests test:fullstack:node` → PASS with the new ✓ lines.

- [ ] **Step 3: Commit** — `test(fullstack): witness the edge guards over the real server — 413 body cap, spoof-proof rate limit, ban after 10 failures`

---

### Task 16: PR 2 docs, gauntlet, mutation table

**Files:**
- Modify: `docs/authentication.md` §2 step 5 (ban check → trusted IP → rate limit → parse → **async** scrypt; the new 413/429-banned responses) and §6.3 if it lists server files
- Modify: `docs/env-files.md` "Other environment variables" table: `RTC_TRUSTED_IP_HEADER`
- Modify: `packages/server/README.md` Auth section (`413`, `429 banned` + `Retry-After`; the Limits table gains the S2/S3/S4/S8/§9.2 rows: body cap, connection caps, token bucket, rate-limit table size, ban thresholds)
- Modify: `docs/architecture/14-composition-and-wiring.md` items 3, 4, 5, 7 (ban list, `decideUpgrade`, `connectionGuard`, per-connection `scopeServicesToConnection`, guarded `toSocket`)
- Modify: `packages/server/src/observability/connectionLog.ts` doc comment (new rejection reasons)

- [ ] **Step 1: Write the docs** (each edit is a sentence or a table row; keep the existing voice).
- [ ] **Step 2: Mutation table** — `pnpm mutation-check "$SCRATCH/b1-pr2-mutants.json"` → every row KILLED.
- [ ] **Step 3: Gauntlet** — `/rtc:gauntlet full` + `pnpm test:e2e`.
- [ ] **Step 4: Commit** — `docs(server): the B1 edge guards — trusted IP, body cap, ban list, connection caps, token bucket`

PR 2 is complete. Start PR 3: `git checkout -b worktree-b1-deploy-posture`.

---

## PR 3 — deploy posture (branch `worktree-b1-deploy-posture`, stacked on PR 2)

### Task 17: unprivileged container user (S13), Fly concurrency limits (§9.2), gates, spec and STATUS

**Files:**
- Modify: `packages/server/Dockerfile`
- Modify: `fly.toml`
- Modify: `tests/scripts/grep-gates.ts` (two custom gates, numbered after the current last gate — read the file's last `name:` to pick the numbers)
- Modify: `docs/DEPLOY.md` (concurrency limits; what to expect when they trip)
- Modify: `docs/superpowers/specs/2026-09-27-public-launch-hardening-design.md` (§2.2 gains a **Status** column; S14 row added; §5 B1 marked done; §6 order advanced to D9)
- Modify: `docs/STATUS.md` (the hardening entry: B1 MERGED, three PR numbers, what each shipped, D9 is next)
- Modify: `CLAUDE.md` only if the `/rtc:gauntlet` row's fast-gate count must change — it must not: the grep gates live inside the single "Architecture + supply-chain gates" step, so the count stays 21.

- [ ] **Step 1: Write the failing gates**

Append two entries to the `GATES` array in `tests/scripts/grep-gates.ts`:

```ts
  {
    name: "47. The server container runs as an unprivileged user (Dockerfile USER node — hardening S13)",
    pattern: "",
    paths: [],
    customCheck: (): string[] => {
      const dockerfile = readFileSync("../packages/server/Dockerfile", "utf8");
      const lines = dockerfile.split("\n");
      const userIndex = lines.findIndex((line) => {
        return /^USER node\s*$/.test(line);
      });
      const cmdIndex = lines.findIndex((line) => {
        return line.startsWith("CMD ");
      });

      if (userIndex < 0) {
        return ["packages/server/Dockerfile: no `USER node` line — the server would run as root"];
      }

      if (cmdIndex >= 0 && userIndex > cmdIndex) {
        return ["packages/server/Dockerfile: `USER node` must come before CMD"];
      }

      return [];
    },
  },
  {
    name: "48. fly.toml declares a connection hard_limit (hardening §9.2 — the only load-shedding knob Fly has)",
    pattern: "",
    paths: [],
    customCheck: (): string[] => {
      const toml = readFileSync("../fly.toml", "utf8");
      const failures: string[] = [];

      if (!/\[http_service\.concurrency\]/.test(toml)) {
        failures.push("fly.toml: missing [http_service.concurrency]");
      }

      if (!/type\s*=\s*"connections"/.test(toml)) {
        failures.push('fly.toml: concurrency type must be "connections" (WebSockets are long-lived)');
      }

      if (!/hard_limit\s*=\s*\d+/.test(toml)) {
        failures.push("fly.toml: missing hard_limit");
      }

      return failures;
    },
  },
```

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @rtc/tests gates` → both new gates FAIL.

- [ ] **Step 3: Dockerfile**

After `RUN pnpm turbo run build --filter=@rtc/server` and before `ENV PORT=4000`:

```dockerfile
# S13 — the build above needs root (pnpm store, dist writes); the running
# server does not. `node` is the unprivileged user the official image ships
# (uid 1000). Everything it reads under /app was written by root with
# world-readable modes, and the server writes nothing to disk.
USER node
```

- [ ] **Step 4: fly.toml**

Inside `[http_service]`, after `min_machines_running = 0`:

```toml
  # §9.2 — Fly's only load-shedding knob. Past hard_limit the proxy refuses
  # new connections to this machine instead of letting it run out of memory
  # (256 MB). The app's own MAX_CONNECTIONS_TOTAL (200, packages/server/src/
  # config/limits.ts) sits below so the app says no before the proxy queues.
  [http_service.concurrency]
    type = "connections"
    soft_limit = 220
    hard_limit = 250
```

- [ ] **Step 5: Run the gates** → PASS. Build the image locally once to prove it still starts as `node`:

```bash
docker build -f packages/server/Dockerfile -t rtc-server-b1 . && docker run --rm -e AUTH_SECRET=x -e AUTH_USERS=demo:demo -p 4010:4000 rtc-server-b1 &
sleep 8 && curl -fsS http://localhost:4010/health && docker exec "$(docker ps -q --filter ancestor=rtc-server-b1)" whoami
```

Expected: `{"ok":true}` and `node`. Stop the container afterwards. (If Docker is unavailable locally, say so in the PR body; the Fly deploy's `/health` step is the fallback witness.)

- [ ] **Step 6: Docs**

`docs/DEPLOY.md`: under "How it works" add a short "Limits in production" paragraph: Fly refuses connections past 250 per machine (what the client sees: the reconnecting `WsAdapter` backs off and retries); the app refuses at 200 total / 8 per IP with a 503 upgrade; bans are 15 minutes, in memory, cleared by a redeploy; `RTC_TRUSTED_IP_HEADER` for a proxy other than Fly.

Spec: add a `Status` column to §2.2 with `Done (PR #…)` per row (S7 → "B3", S12 → "B2 roles"); add row **S14** "No `error` listener on accepted sockets — a protocol-violating frame was an unhandled event, i.e. a process crash. Fixed with S1." Update §5 B1 to "**Done 2026-10-0x** — PRs #a, #b, #c" and §6 to put the D9 UI round next.

`docs/STATUS.md`: rewrite the hardening entry's B1 clause to MERGED with the three PR numbers, one line each on what shipped, note S14, and "D9 UI round is NEXT".

- [ ] **Step 7: Gauntlet** — `/rtc:gauntlet` (fast tier suffices: this PR is config, gates and docs) + `pnpm check:doc-links`.

- [ ] **Step 8: Commit** — `feat(deploy): unprivileged container user, Fly connection hard_limit, two gates that keep both (S13, §9.2)` and a second commit `docs(hardening): B1 done — spec status column, S14, STATUS entry`.

---

## Closing batch (one outward step per Bash call)

1. `git push -u origin worktree-b1-server-hardening` (from the worktree).
2. `git push -u origin worktree-b1-edge-guards`.
3. `git push -u origin worktree-b1-deploy-posture`.
4. `gh pr create` for PR 1 (base `main`), body: scope S1/S6/S8c/S9/S11/S14, the mutation kill table, the smoke output lines, the standard attribution.
5. `gh pr create` for PR 2 (base `worktree-b1-server-hardening`, "stacked on #PR1"); 6. PR 3 (base `worktree-b1-edge-guards`).
7. Watch CI per head SHA; after PR 1 merges, `gh pr edit <PR2> --base main` (one outward call), wait for CI, merge; same for PR 3. Check code scanning (`gh api …/code-scanning/alerts?ref=refs/pull/N/merge&state=open`) before each merge.
8. Remove the worktree and the three branches.

**Not in B1 (deliberately):** S7 durable metering (B3), S12 `/mcp` confirmation step (B2 roles), the Cloudflare layer (§9.2, DNS + a server check — a user-run step), rotating `AUTH_USERS` (user's ops), redeploying (manual `deploy.yml`).
