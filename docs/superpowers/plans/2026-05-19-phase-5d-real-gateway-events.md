# Phase 5D — Real Gateway-Events Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `withSyntheticGatewayConnected` in `packages/client/src/app/composition.ts` with real per-mode gateway-events adapters (WS-real reads `WsAdapter.onopen`/`onclose`; simulator emits one-shot `gatewayConnected`); merge with the existing `BrowserConnectionEventsAdapter` at the composition root. Add `CONNECTING → DISCONNECTED on gatewayDisconnected` to the state machine so server-down-on-boot surfaces correctly.

**Architecture:** `IWsAdapter` gains `connectionEvents(): Observable<ConnectionEvent>`, backed by `ReplaySubject<ConnectionEvent>(1)` in `WsAdapter` (fed by `onopen`/`onclose`) and in `FakeWsAdapter` (fed by a new test-only `emitConnectionEvent` helper). A thin `WsConnectionEventsAdapter` wraps `IWsAdapter.connectionEvents()` as a `ConnectionEventsPort`. A `ConnectionEventsSimulator` lives alongside the other simulators in `@rtc/domain/src/simulators/` and emits `of({type:"gatewayConnected"})`. The composition root chooses one gateway source by transport mode, then `merge()`s with the existing `BrowserConnectionEventsAdapter`.

**Tech Stack:** TypeScript, RxJS, Vitest, pnpm workspaces, Turborepo. No new runtime dependencies. Reuses Phase 5C's `IWsAdapter` interface + `FakeWsAdapter`.

**Spec:** `docs/superpowers/specs/2026-05-19-phase-5d-real-gateway-events-design.md` (commit `19b43ef`).

---

## File structure

**New files (5):**

| Path | Role |
|---|---|
| `packages/client/src/app/adapters/WsConnectionEventsAdapter.ts` | Thin wrapper: `ConnectionEventsPort` over `IWsAdapter.connectionEvents()` |
| `packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts` | Unit test via `FakeWsAdapter` |
| `packages/client/src/app/adapters/WsAdapter.test.ts` | Lifecycle round-trip + replay test for `WsAdapter.connectionEvents()` |
| `packages/domain/src/simulators/ConnectionEventsSimulator.ts` | `ConnectionEventsPort` for simulator mode (emits `gatewayConnected` once) |
| `packages/domain/src/simulators/ConnectionEventsSimulator.test.ts` | Single-emission + completion test |

**Modified files (10):**

| Path | Change |
|---|---|
| `packages/domain/src/connection/connectionStatus.ts` | Add `CONNECTING → DISCONNECTED on gatewayDisconnected` |
| `packages/domain/src/connection/connectionStatus.test.ts` | Add boot-time server-down test |
| `packages/client/src/app/adapters/IWsAdapter.ts` | Add `connectionEvents(): Observable<ConnectionEvent>` |
| `packages/client/src/app/adapters/WsAdapter.ts` | `ReplaySubject(1)` field; `onopen`/`onclose` push; new method; dispose completes |
| `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts` | `ReplaySubject(1)` field; new method; test-only `emitConnectionEvent` helper |
| `packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts` | Coverage for new methods |
| `packages/domain/src/simulators/index.ts` | Re-export `ConnectionEventsSimulator` |
| `packages/domain/src/index.ts` | Re-export `ConnectionEventsSimulator` |
| `packages/client/src/app/composition.ts` | Delete `withSyntheticGatewayConnected`; new wiring |
| `packages/client/src/index.ts` | Drop `withSyntheticGatewayConnected` re-export |
| `tests/scenarios/presenter/_buildApp.ts` | Drop synthetic; use `ConnectionEventsSimulator` + Subject merge |
| `tests/scenarios/presenter/_shared/connection.ts` | `browserComesBackOnline` pushes both events |
| `docs/architecture.md` | §5.1 state diagram transition; new adapter paragraph |
| `docs/superpowers/STATUS.md` | Flip Phase 5D row to ✅ DONE with SHA range; record follow-ups |

---

## Task ordering

1. **State machine transition** — additive, self-contained, foundational
2. **`IWsAdapter.connectionEvents()` + stub impls in both adapters** — single TS unit so codebase keeps building
3. **`WsAdapter.connectionEvents()` lifecycle wiring + `WsAdapter.test.ts`**
4. **`FakeWsAdapter.emitConnectionEvent` test helper + tests**
5. **`WsConnectionEventsAdapter` + test**
6. **`ConnectionEventsSimulator` + test + barrel exports**
7. **Migrate `composition.ts`** — delete synthetic, wire new adapters
8. **Drop `withSyntheticGatewayConnected` from `@rtc/client` re-exports**
9. **Migrate test harness** — `_buildApp.ts` + `_shared/connection.ts`
10. **Full verification pass** — `pnpm build && typecheck && test && test:e2e` + presenter peers
11. **Docs** — `architecture.md` §5.1 + adapter blurb
12. **`STATUS.md`** — flip Phase 5D + record follow-ups

---

## Task 1: State machine — `CONNECTING → DISCONNECTED on gatewayDisconnected`

**Files:**
- Modify: `packages/domain/src/connection/connectionStatus.ts:29-37`
- Modify: `packages/domain/src/connection/connectionStatus.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/domain/src/connection/connectionStatus.test.ts`, after the existing `CONNECTING -> CONNECTED on gatewayConnected` test (line ~10):

```ts
it("CONNECTING -> DISCONNECTED on gatewayDisconnected (boot-time server-down)", () => {
  expect(
    nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "gatewayDisconnected" }),
  ).toBe(ConnectionStatus.DISCONNECTED);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @rtc/domain test -- connectionStatus`
Expected: FAIL — assertion shows `CONNECTING` returned instead of `DISCONNECTED`.

- [ ] **Step 3: Add the transition**

In `packages/domain/src/connection/connectionStatus.ts`, modify the `case ConnectionStatus.CONNECTING:` block (lines 29–37) so `gatewayDisconnected` returns `DISCONNECTED`:

```ts
    case ConnectionStatus.CONNECTING:
      switch (event.type) {
        case "gatewayConnected":
          return ConnectionStatus.CONNECTED;
        case "gatewayDisconnected":
          return ConnectionStatus.DISCONNECTED;
        case "browserOffline":
          return ConnectionStatus.OFFLINE_DISCONNECTED;
        default:
          return current;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @rtc/domain test -- connectionStatus`
Expected: PASS (all `nextConnectionStatus` tests pass, including the new one).

- [ ] **Step 5: Verify the rest of the domain tests still pass**

Run: `pnpm -F @rtc/domain test`
Expected: PASS, total count is **previous + 1**.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/connection/connectionStatus.ts packages/domain/src/connection/connectionStatus.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): CONNECTING -> DISCONNECTED on gatewayDisconnected

So a server-down-on-boot WS attempt surfaces as DISCONNECTED instead
of remaining stuck at CONNECTING forever.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `IWsAdapter` + stub `connectionEvents()` in both impls

**Goal of this task:** Add the method to the interface and both implementations with `ReplaySubject<ConnectionEvent>(1)` backing, but do NOT yet wire `WsAdapter.onopen`/`onclose`. Codebase keeps compiling; no behavior change yet.

**Files:**
- Modify: `packages/client/src/app/adapters/IWsAdapter.ts`
- Modify: `packages/client/src/app/adapters/WsAdapter.ts`
- Modify: `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts`

- [ ] **Step 1: Extend `IWsAdapter.ts`**

Replace the contents of `packages/client/src/app/adapters/IWsAdapter.ts` with:

```ts
// packages/client/src/app/adapters/IWsAdapter.ts
import type { Observable } from "rxjs";
import type { ConnectionEvent } from "@rtc/domain";

/**
 * Common surface for the real WsAdapter and the test-only FakeWsAdapter.
 * Both must agree on these method signatures so port factories work against either.
 */
export type MessageHandler = (payload: unknown) => void;

export interface IWsAdapter {
  on(type: string, handler: MessageHandler): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
  /**
   * Observable of gateway lifecycle events.
   * Backed by `ReplaySubject(1)` so late subscribers see the most recent state.
   */
  connectionEvents(): Observable<ConnectionEvent>;
  dispose(): void;
}
```

- [ ] **Step 2: Add `connectionEvents()` to `WsAdapter`**

In `packages/client/src/app/adapters/WsAdapter.ts`:

(a) Add to the imports block at the top:

```ts
import { ReplaySubject, type Observable } from "rxjs";
import type { ConnectionEvent } from "@rtc/domain";
```

(b) Inside the `WsAdapter` class, after the existing private fields, add:

```ts
  private readonly connectionEvents$ = new ReplaySubject<ConnectionEvent>(1);
```

(c) Add the new method to the class (anywhere among the public methods, e.g. just before `dispose()`):

```ts
  connectionEvents(): Observable<ConnectionEvent> {
    return this.connectionEvents$.asObservable();
  }
```

(d) **Do not yet** wire `onopen`/`onclose`. That happens in Task 3.

- [ ] **Step 3: Add `connectionEvents()` to `FakeWsAdapter`**

In `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts`:

(a) Add to the imports block at the top:

```ts
import { ReplaySubject, type Observable } from "rxjs";
import type { ConnectionEvent } from "@rtc/domain";
```

(b) Inside the `FakeWsAdapter` class, add the field next to the existing private fields:

```ts
  private connectionEvents$ = new ReplaySubject<ConnectionEvent>(1);
```

(c) Add the method (alongside `on`/`send`/`rpc`):

```ts
  connectionEvents(): Observable<ConnectionEvent> {
    return this.connectionEvents$.asObservable();
  }
```

(d) **Do not yet** add `emitConnectionEvent`. That happens in Task 4.

- [ ] **Step 4: Verify the codebase still builds + passes tests**

Run: `pnpm -F @rtc/client typecheck && pnpm -F @rtc/client test`
Expected: PASS. No new tests; nothing should break because both impls now satisfy the new interface method.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/app/adapters/IWsAdapter.ts packages/client/src/app/adapters/WsAdapter.ts packages/client/src/app/adapters/__test__/FakeWsAdapter.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): IWsAdapter.connectionEvents() with ReplaySubject(1) backing

Interface extension + stub implementations in WsAdapter and FakeWsAdapter.
Subject is wired but not yet fed by lifecycle events; Task 3 wires
onopen/onclose, Task 4 adds the test-only emitConnectionEvent helper.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `WsAdapter.onopen`/`onclose` to `connectionEvents$` + new `WsAdapter.test.ts`

**Files:**
- Modify: `packages/client/src/app/adapters/WsAdapter.ts`
- Create: `packages/client/src/app/adapters/WsAdapter.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `packages/client/src/app/adapters/WsAdapter.test.ts`:

```ts
// packages/client/src/app/adapters/WsAdapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConnectionEvent } from "@rtc/domain";
import { WsAdapter } from "./WsAdapter";

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

let lastMock: MockWebSocket;

beforeEach(() => {
  vi.stubGlobal(
    "WebSocket",
    vi.fn().mockImplementation(() => {
      lastMock = new MockWebSocket();
      return lastMock;
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WsAdapter.connectionEvents()", () => {
  it("emits gatewayConnected when the WebSocket opens", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));

    lastMock.onopen?.(new Event("open"));

    expect(events).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("emits gatewayDisconnected when the WebSocket closes", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));

    lastMock.onclose?.(new CloseEvent("close"));

    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
    adapter.dispose();
  });

  it("replays the last lifecycle event to late subscribers", () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.onopen?.(new Event("open"));

    const lateEvents: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => lateEvents.push(e));

    expect(lateEvents).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("dispose() completes the subject", () => {
    const adapter = new WsAdapter("ws://test");
    let completed = false;
    adapter.connectionEvents().subscribe({
      complete: () => {
        completed = true;
      },
    });
    adapter.dispose();
    expect(completed).toBe(true);
  });

  it("does not emit gatewayDisconnected when onclose fires after dispose", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));
    adapter.dispose();
    lastMock.onclose?.(new CloseEvent("close"));
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test file — confirm failures**

Run: `pnpm -F @rtc/client test -- WsAdapter`
Expected: FAILs — `onopen`/`onclose` handlers do not yet push to `connectionEvents$`, so the `events` arrays stay empty.

- [ ] **Step 3: Wire `onopen` / `onclose` and dispose**

In `packages/client/src/app/adapters/WsAdapter.ts`, inside the `connect()` private method:

Replace:
```ts
    this.ws.onopen = () => {
      console.log("[WsAdapter] Connected to", this.url);
    };
```
with:
```ts
    this.ws.onopen = () => {
      console.log("[WsAdapter] Connected to", this.url);
      this.connectionEvents$.next({ type: "gatewayConnected" });
    };
```

Replace:
```ts
    this.ws.onclose = () => {
      if (this.disposed) return;
      console.log("[WsAdapter] Disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
      this.scheduleReconnect();
    };
```
with:
```ts
    this.ws.onclose = () => {
      if (this.disposed) return;
      this.connectionEvents$.next({ type: "gatewayDisconnected" });
      console.log("[WsAdapter] Disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
      this.scheduleReconnect();
    };
```

In `dispose()`, add `this.connectionEvents$.complete();` right after `this.disposed = true;`:

```ts
  dispose(): void {
    this.disposed = true;
    this.connectionEvents$.complete();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.handlers.clear();
    for (const rpc of this.pendingRpcs.values()) {
      rpc.reject(new Error("WsAdapter disposed"));
    }
    this.pendingRpcs.clear();
  }
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `pnpm -F @rtc/client test -- WsAdapter`
Expected: PASS (all 5 new tests).

- [ ] **Step 5: Re-run the full client test suite**

Run: `pnpm -F @rtc/client test`
Expected: PASS, total count is **previous + 5**.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/app/adapters/WsAdapter.ts packages/client/src/app/adapters/WsAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): WsAdapter emits gatewayConnected/Disconnected from WS lifecycle

onopen pushes gatewayConnected, onclose pushes gatewayDisconnected (guarded
by the existing `disposed` flag). dispose() completes the subject. Late
subscribers receive the replayed last event via ReplaySubject(1).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `FakeWsAdapter.emitConnectionEvent` + tests

**Files:**
- Modify: `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts`
- Modify: `packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts`, before the closing `});` of the outer `describe`:

```ts
  it("emitConnectionEvent('gatewayConnected') reaches connectionEvents() subscribers", () => {
    const ws = new FakeWsAdapter();
    const events: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));
    ws.emitConnectionEvent("gatewayConnected");
    expect(events).toEqual([{ type: "gatewayConnected" }]);
  });

  it("emitConnectionEvent('gatewayDisconnected') reaches subscribers", () => {
    const ws = new FakeWsAdapter();
    const events: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));
    ws.emitConnectionEvent("gatewayDisconnected");
    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
  });

  it("connectionEvents() replays the last event to late subscribers", () => {
    const ws = new FakeWsAdapter();
    ws.emitConnectionEvent("gatewayConnected");
    const lateEvents: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => lateEvents.push(e));
    expect(lateEvents).toEqual([{ type: "gatewayConnected" }]);
  });

  it("dispose() completes the connection-events subject", () => {
    const ws = new FakeWsAdapter();
    let completed = false;
    ws.connectionEvents().subscribe({ complete: () => { completed = true; } });
    ws.dispose();
    expect(completed).toBe(true);
  });
```

- [ ] **Step 2: Run tests — confirm failures**

Run: `pnpm -F @rtc/client test -- FakeWsAdapter`
Expected: FAIL — `ws.emitConnectionEvent is not a function`.

- [ ] **Step 3: Add `emitConnectionEvent` and complete the subject on dispose**

In `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts`:

(a) Inside the `dispose()` method, add `this.connectionEvents$.complete();` as the first line so the subject completes on teardown:

```ts
  dispose(): void {
    this.connectionEvents$.complete();
    this.listeners.clear();
    this.pendingRpcs = [];
    this.sent = [];
  }
```

(b) In the "Test-only API" section (after the existing `hasPendingRpc` method), add:

```ts
  /** Drive a fake gateway lifecycle event to all connectionEvents() subscribers. */
  emitConnectionEvent(type: "gatewayConnected" | "gatewayDisconnected"): void {
    this.connectionEvents$.next({ type });
  }
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `pnpm -F @rtc/client test -- FakeWsAdapter`
Expected: PASS — all original `FakeWsAdapter` tests + 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/app/adapters/__test__/FakeWsAdapter.ts packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): FakeWsAdapter.emitConnectionEvent + replay/dispose tests

Test-only helper that drives a gateway lifecycle event into the
connectionEvents() subject. dispose() now also completes the subject.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `WsConnectionEventsAdapter` + test

**Files:**
- Create: `packages/client/src/app/adapters/WsConnectionEventsAdapter.ts`
- Create: `packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts`:

```ts
// packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts
import { describe, it, expect } from "vitest";
import type { ConnectionEvent } from "@rtc/domain";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { WsConnectionEventsAdapter } from "./WsConnectionEventsAdapter";

describe("WsConnectionEventsAdapter", () => {
  it("delegates events() to IWsAdapter.connectionEvents()", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsConnectionEventsAdapter(ws);
    const received: ConnectionEvent[] = [];
    adapter.events().subscribe((e) => received.push(e));

    ws.emitConnectionEvent("gatewayConnected");
    ws.emitConnectionEvent("gatewayDisconnected");

    expect(received).toEqual([
      { type: "gatewayConnected" },
      { type: "gatewayDisconnected" },
    ]);
  });

  it("replays the most recent event to a late subscriber", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsConnectionEventsAdapter(ws);
    ws.emitConnectionEvent("gatewayConnected");

    const late: ConnectionEvent[] = [];
    adapter.events().subscribe((e) => late.push(e));

    expect(late).toEqual([{ type: "gatewayConnected" }]);
  });
});
```

- [ ] **Step 2: Run — confirm failure**

Run: `pnpm -F @rtc/client test -- WsConnectionEventsAdapter`
Expected: FAIL — module `./WsConnectionEventsAdapter` not found.

- [ ] **Step 3: Create the adapter**

Create `packages/client/src/app/adapters/WsConnectionEventsAdapter.ts`:

```ts
// packages/client/src/app/adapters/WsConnectionEventsAdapter.ts
import type { Observable } from "rxjs";
import type { ConnectionEvent, ConnectionEventsPort } from "@rtc/domain";
import type { IWsAdapter } from "./IWsAdapter";

/**
 * ConnectionEventsPort backed by an IWsAdapter's lifecycle stream.
 * Used in WS-real mode; merged with BrowserConnectionEventsAdapter
 * at the composition root.
 */
export class WsConnectionEventsAdapter implements ConnectionEventsPort {
  constructor(private readonly ws: IWsAdapter) {}

  events(): Observable<ConnectionEvent> {
    return this.ws.connectionEvents();
  }
}
```

- [ ] **Step 4: Run — confirm pass**

Run: `pnpm -F @rtc/client test -- WsConnectionEventsAdapter`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/app/adapters/WsConnectionEventsAdapter.ts packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): WsConnectionEventsAdapter (ConnectionEventsPort over IWsAdapter)

Thin wrapper. ConnectionEventsPort.events() delegates to
IWsAdapter.connectionEvents(). Unit-tested via FakeWsAdapter
(symmetric with the rest of the Phase 5C adapter testing pattern).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ConnectionEventsSimulator` + test + barrel re-exports

**Files:**
- Create: `packages/domain/src/simulators/ConnectionEventsSimulator.ts`
- Create: `packages/domain/src/simulators/ConnectionEventsSimulator.test.ts`
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/simulators/ConnectionEventsSimulator.test.ts`:

```ts
// packages/domain/src/simulators/ConnectionEventsSimulator.test.ts
import { describe, it, expect } from "vitest";
import { toArray, lastValueFrom } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";
import { ConnectionEventsSimulator } from "./ConnectionEventsSimulator.js";

describe("ConnectionEventsSimulator", () => {
  it("emits exactly one gatewayConnected event then completes", async () => {
    const sim = new ConnectionEventsSimulator();
    const all = await lastValueFrom(sim.events().pipe(toArray()));
    expect(all).toEqual<ConnectionEvent[]>([{ type: "gatewayConnected" }]);
  });

  it("is replayable across multiple subscriptions", async () => {
    const sim = new ConnectionEventsSimulator();
    const a = await lastValueFrom(sim.events().pipe(toArray()));
    const b = await lastValueFrom(sim.events().pipe(toArray()));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run — confirm failure**

Run: `pnpm -F @rtc/domain test -- ConnectionEventsSimulator`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the simulator**

Create `packages/domain/src/simulators/ConnectionEventsSimulator.ts`:

```ts
// packages/domain/src/simulators/ConnectionEventsSimulator.ts
import { of, type Observable } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";

/**
 * ConnectionEventsPort for simulator mode.
 * No real gateway exists, so the simulator emits a single one-shot
 * gatewayConnected event and completes. The state machine reaches
 * CONNECTED on subscribe; subsequent browser events (offline/online,
 * idle/userActivity) come from BrowserConnectionEventsAdapter and
 * are merged at the composition root.
 */
export class ConnectionEventsSimulator implements ConnectionEventsPort {
  events(): Observable<ConnectionEvent> {
    return of({ type: "gatewayConnected" });
  }
}
```

- [ ] **Step 4: Re-export from `simulators/index.ts`**

In `packages/domain/src/simulators/index.ts`, add the re-export (alphabetical order with the others isn't enforced; place it before `CreditRfqSimulator` for readability):

```ts
export { ReferenceDataSimulator } from "./ReferenceDataSimulator.js";
export { PricingSimulator } from "./PricingSimulator.js";
export { ExecutionSimulator } from "./ExecutionSimulator.js";
export type { TradeListener } from "./ExecutionSimulator.js";
export { TradeStoreSimulator } from "./TradeStoreSimulator.js";
export { AnalyticsSimulator } from "./AnalyticsSimulator.js";
export {
  InstrumentSimulator,
  DealerSimulator,
  INSTRUMENTS_CATALOG,
  DEALERS_CATALOG,
} from "./creditReferenceDataSimulator.js";
export { CreditRfqSimulator } from "./CreditRfqSimulator.js";
export { ConnectionEventsSimulator } from "./ConnectionEventsSimulator.js";
```

- [ ] **Step 5: Re-export from `domain/src/index.ts`**

In `packages/domain/src/index.ts`, find the "Simulators (in-memory port implementations)" block (around line 45) and add `ConnectionEventsSimulator` to the re-exported names:

```ts
// Simulators (in-memory port implementations)
export {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  InstrumentSimulator,
  DealerSimulator,
  CreditRfqSimulator,
  ConnectionEventsSimulator,
  INSTRUMENTS_CATALOG,
  DEALERS_CATALOG,
} from "./simulators/index.js";
```

- [ ] **Step 6: Run tests — confirm pass**

Run: `pnpm -F @rtc/domain test -- ConnectionEventsSimulator`
Expected: PASS (2 tests).

Then run: `pnpm -F @rtc/domain test`
Expected: PASS, total count is **previous + 2**.

- [ ] **Step 7: Verify the build chain still typechecks**

Run: `pnpm typecheck`
Expected: PASS — `@rtc/domain` builds, `@rtc/client` typecheck still finds the new export.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/simulators/ConnectionEventsSimulator.ts packages/domain/src/simulators/ConnectionEventsSimulator.test.ts packages/domain/src/simulators/index.ts packages/domain/src/index.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): ConnectionEventsSimulator (one-shot gatewayConnected)

Simulator-mode ConnectionEventsPort. Emits a single gatewayConnected then
completes; subsequent browser events flow from BrowserConnectionEventsAdapter
merged at the composition root. Replayable across multiple subscriptions
because `of(...)` is cold.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrate `composition.ts` — delete synthetic wrapper, wire new adapters

**Files:**
- Modify: `packages/client/src/app/composition.ts`

- [ ] **Step 1: Replace the file contents**

Replace `packages/client/src/app/composition.ts` with:

```ts
import { merge } from "rxjs";
import {
  ConnectionEventsSimulator,
  type ConnectionEventsPort,
} from "@rtc/domain";

import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";

import { WsAdapter } from "./adapters/WsAdapter";
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import { WsConnectionEventsAdapter } from "./adapters/WsConnectionEventsAdapter";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type AppPorts,
} from "./adapters/portFactory";

export type { AppPorts };

export interface Presenters {
  priceStream: PriceStreamPresenter;
  priceHistory: PriceHistoryPresenter;
  execution: TradeExecutionPresenter;
  blotter: BlotterPresenter;
  analytics: AnalyticsPresenter;
  rfqs: RfqsPresenter;
  currencyPairs: CurrencyPairsPresenter;
  instruments: InstrumentsPresenter;
  dealers: DealersPresenter;
  connection: ConnectionStatusPresenter;
  rfqQuote: RfqQuotePresenter;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();
  if (url) {
    const ws = new WsAdapter(url);
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => merge(gateway.events(), browser.events()),
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }
  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => merge(gateway.events(), browser.events()),
  };
  return { ...createSimulatorPorts(), connectionEvents };
}

export function createApp(ports: AppPorts = buildDefaultPorts()): App {
  const presenters: Presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
  };
  return { presenters, ports };
}
```

(Note: `withSyntheticGatewayConnected` is deleted; the `concatMap`, `from`, `of`, `type ConnectionEvent` imports it required are removed.)

- [ ] **Step 2: Verify typecheck + client tests**

Run: `pnpm typecheck`
Expected: PASS at `@rtc/client`. 

Run: `pnpm -F @rtc/client test`
Expected: PASS (all client tests, no new failures). The `composition.ts` change is wiring; no `composition.ts`-specific test exists today.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/app/composition.ts
git commit -m "$(cat <<'EOF'
feat(phase-5d): composition root wires real gateway adapters

WS-real mode: WsConnectionEventsAdapter(WsAdapter) merged with browser
events. Simulator mode: ConnectionEventsSimulator() merged with browser
events. withSyntheticGatewayConnected deleted from this file.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Drop `withSyntheticGatewayConnected` from `@rtc/client` re-exports

**Files:**
- Modify: `packages/client/src/index.ts`

- [ ] **Step 1: Update the barrel**

Replace `packages/client/src/index.ts` with:

```ts
export {
  createApp,
  buildDefaultPorts,
  type App,
  type Presenters,
  type AppPorts,
} from "./app/composition";
export {
  createSimulatorPorts,
  createWsRealPorts,
} from "./app/adapters/portFactory";
```

- [ ] **Step 2: Typecheck — confirm no consumer broke**

Run: `pnpm typecheck`
Expected: TYPECHECK ERROR at `tests/scenarios/presenter/_buildApp.ts` line that imports `withSyntheticGatewayConnected` — that's the file Task 9 migrates. Note the error and proceed.

- [ ] **Step 3: Commit (intentional broken state — fixed in Task 9)**

```bash
git add packages/client/src/index.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5d): drop withSyntheticGatewayConnected from @rtc/client exports

The function is deleted in composition.ts (previous commit); this removes
it from the public barrel. tests/scenarios/presenter/_buildApp.ts still
imports it and will fail typecheck until Task 9 migrates the test harness.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Yes, this commit deliberately leaves typecheck broken for one commit. Task 9 restores it. If you prefer a clean intermediate state, fold Tasks 8 + 9 into a single commit.)

---

## Task 9: Migrate the presenter test harness

**Files:**
- Modify: `tests/scenarios/presenter/_buildApp.ts`
- Modify: `tests/scenarios/presenter/_shared/connection.ts`

- [ ] **Step 1: Update `_buildApp.ts`**

Replace `tests/scenarios/presenter/_buildApp.ts` with:

```ts
// tests/scenarios/presenter/_buildApp.ts
import { merge, Subject } from "rxjs";
import {
  ConnectionEventsSimulator,
  type ConnectionEvent,
} from "@rtc/domain";
import {
  createApp,
  createSimulatorPorts,
  type App,
  type AppPorts,
} from "@rtc/client";

export interface PresenterCtx {
  app: App;
  connectionEvents$: Subject<ConnectionEvent>;
}

export function buildPresenterApp(): PresenterCtx {
  const connectionEvents$ = new Subject<ConnectionEvent>();
  const gateway = new ConnectionEventsSimulator();
  const ports: AppPorts = {
    ...createSimulatorPorts(),
    connectionEvents: {
      events: () => merge(gateway.events(), connectionEvents$.asObservable()),
    },
  };
  return { app: createApp(ports), connectionEvents$ };
}
```

- [ ] **Step 2: Update `_shared/connection.ts`**

Modify `tests/scenarios/presenter/_shared/connection.ts`: change `browserComesBackOnline` so it pushes both `browserOnline` and `gatewayConnected`. The new shape:

```ts
export async function browserComesBackOnline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOnline" });
  w.ctx.connectionEvents$.next({ type: "gatewayConnected" });
}
```

Leave the other exports (`browserGoesOffline`, `expectStatusEqualsWithin`, etc.) unchanged.

- [ ] **Step 3: Typecheck — confirm clean**

Run: `pnpm typecheck`
Expected: PASS in all packages.

- [ ] **Step 4: Run the presenter test suites — all 4 peers**

Run: `pnpm -F @rtc/tests test:presenter:cucumber-real`
Expected: PASS — all 19 @presenter scenarios.

Run: `pnpm -F @rtc/tests test:presenter:cucumber-fake`
Expected: PASS — all 19.

Run: `pnpm -F @rtc/tests test:presenter:vitest-fake`
Expected: PASS — all 19.

Run: `pnpm -F @rtc/tests test:presenter:vitest-plain`
Expected: PASS — all 19.

(If your monorepo doesn't expose these per-peer scripts, fall back to running the appropriate config via `pnpm -F @rtc/tests run` with whatever entry-point script exists.)

- [ ] **Step 5: Commit**

```bash
git add tests/scenarios/presenter/_buildApp.ts tests/scenarios/presenter/_shared/connection.ts
git commit -m "$(cat <<'EOF'
test(phase-5d): migrate presenter harness off withSyntheticGatewayConnected

_buildApp.ts now uses ConnectionEventsSimulator merged with a per-test
Subject. _shared/connection.ts's browserComesBackOnline pushes both
browserOnline and gatewayConnected, mirroring what a real WsAdapter
does on network return.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Clean build**

Run: `pnpm build`
Expected: PASS (all 4 packages topologically: domain → shared → client + server).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Unit tests**

Run: `pnpm test`
Expected: PASS. Compared to the pre-5D total (193), expect roughly **+12 tests** (1 state-machine + 5 WsAdapter + 4 FakeWsAdapter + 2 WsConnectionEventsAdapter + 2 ConnectionEventsSimulator = ~14, give or take depending on how subagents structure individual test cases). Total should be in the ~205–210 range. Exact number is recorded in STATUS.md in Task 12.

- [ ] **Step 4: E2E suites (4 peers)**

Run: `pnpm test:e2e` (or the equivalent that exercises Cucumber+Playwright, Cucumber+Cypress, raw Playwright, raw Cypress).
Expected: PASS — all 4 e2e peers × 48 scenarios. The `coming back online dismisses the overlay` scenario is the one to watch (see Risks in spec); flag if it flakes.

- [ ] **Step 5: Grep gates**

Run: `pnpm -F @rtc/tests run gates` (or whatever the existing script is — e.g. `tsx tests/scripts/grep-gates.ts`).
Expected: PASS all 23 gates. None of the existing gates should be affected by 5D.

- [ ] **Step 6: No commit (verification only)**

Nothing to commit. If anything failed above, fix in the offending task and re-run.

---

## Task 11: Update `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Verify §5.1 state diagram**

Find §5.1 (Connection Status) in `docs/architecture.md` (around line 882). The Mermaid `stateDiagram-v2` block already includes (the arrow was drawn aspirationally before the state machine implemented it):

```
    CONNECTING --> CONNECTED : gatewayConnected
    CONNECTING --> DISCONNECTED : gatewayDisconnected
```

No change needed here. The Task 1 commit made the code match the diagram. If for some reason the arrow is missing, add this line with the same indentation as the surrounding arrows:

```
    CONNECTING --> DISCONNECTED : gatewayDisconnected
```

- [ ] **Step 2: Add a "Gateway events adapter pair" subsection**

Find §3.3 (Ports & Adapters – Hexagonal Architecture). Append a paragraph describing the new adapter pair. Suggested location: right before §3.4 starts.

```markdown
**Gateway-events adapter pair.** `ConnectionEventsPort` is supplied by one of two transport-specific adapters chosen at the composition root: `WsConnectionEventsAdapter` (wraps `IWsAdapter.connectionEvents()` so `WsAdapter`'s `onopen`/`onclose` lifecycle reaches the state machine) in WS-real mode, or `ConnectionEventsSimulator` (one-shot `of(gatewayConnected)`) in simulator mode. Either choice is then merged with `BrowserConnectionEventsAdapter` (the source of `browserOnline`/`browserOffline`/`idleTimeout`/`userActivity`) via a plain `merge(...)` in `composition.ts`. This pair replaced the Phase 3 `withSyntheticGatewayConnected` wrapper, which fabricated `gatewayConnected` events independent of the actual transport state — a workaround that produced a misleading CONNECTED transient on server-down-on-boot.
```

- [ ] **Step 3: (Optional) Update §11 if it references the connection layer**

If §11 (Key Files Reference) lists `withSyntheticGatewayConnected` or `composition.ts`'s wiring, refresh those references to point at the new files (`WsConnectionEventsAdapter.ts`, `ConnectionEventsSimulator.ts`). Otherwise no change needed here.

- [ ] **Step 4: Verify diagram still renders**

If a CI step renders Mermaid, run it. Otherwise sanity-check the diagram in a Markdown previewer (or trust the change — it's purely additive).

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md
git commit -m "$(cat <<'EOF'
docs(architecture): record Phase 5D gateway-events adapter pair

§5.1 state diagram: explicit CONNECTING -> DISCONNECTED on
gatewayDisconnected arrow. §3.3 gains a paragraph on the
WsConnectionEventsAdapter / ConnectionEventsSimulator pair and the
composition-root merge, replacing the deleted withSyntheticGatewayConnected.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Flip Phase 5D to ✅ DONE in `STATUS.md`

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Capture the SHA range**

Run: `git log origin/main..HEAD --oneline`
Note the **first** (oldest) and **last** (newest) commit SHAs in the range. The first SHA is the Task 1 state-machine commit; the last SHA is the previous task's `docs/architecture.md` commit.

- [ ] **Step 2: Flip the table row**

In `docs/superpowers/STATUS.md`, locate the row:

```
| Phase 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected` | ⏳ NOT STARTED | (to be written) | — |
```

Replace with (substituting the actual SHAs):

```
| Phase 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected` | ✅ DONE | `plans/2026-05-19-phase-5d-real-gateway-events.md` | `<first-sha>..<last-sha>` (12 task commits) + this STATUS update |
```

- [ ] **Step 3: Update "Last updated"**

Change the `**Last updated:**` line at the top of the file to today's date with `(5D DONE)`:

```
**Last updated:** 2026-05-19 (5D DONE)
```

- [ ] **Step 4: Add a "Phase 5D follow-ups" section**

Just before the `## Open questions for Phase 3 (brainstorm before writing the plan)` section (which is the last narrative block), add:

```markdown
## Phase 5D follow-ups (carry into 5E+)

1. **`WsAdapter.ts` size review.** With the lifecycle additions, the class now juggles message I/O, reconnect scheduling, RPC tracking, AND lifecycle observation. The file is still readable (<200 lines), but a future contributor may benefit from splitting lifecycle observation into a helper or rethinking the reconnect loop.
2. **`RECONNECT_DELAY_MS = 3_000` is hard-coded.** Consider making it configurable (constructor option or environment variable) for tests and for tuning production reconnect behavior.
3. **State-diagram `DISCONNECTED → CONNECTING : reconnectAttempt every 10s` is still aspirational.** No `reconnectAttempt` event type exists; the actual reconnect goes DISCONNECTED → CONNECTED directly when `WsAdapter.onopen` fires. Either implement the intermediate transition (requires a new event type + emitter) or remove the arrow from the diagram for accuracy.
4. **Double `gatewayDisconnected` on browser-offline.** When the browser goes offline, both `BrowserConnectionEventsAdapter` (immediate `browserOffline`) and `WsAdapter` (`onclose` from TCP teardown) emit events. The state machine handles this correctly via default branches in OFFLINE_DISCONNECTED, but the duplication is conceptually ugly and could be cleaned up by gating WS lifecycle emissions on the browser state.
5. **Browser e2e flakiness watch.** First runs after 5D may surface timing issues with the 5s budget for `coming back online dismisses the overlay`. If flaky, bump the budget or reduce `RECONNECT_DELAY_MS`.
6. **No `ConnectionEventsPort` contract test layer.** Phase 5C's 8-port contract pattern doesn't extend here because simulator and WS-real impls are fundamentally divergent (one-shot vs long-lived lifecycle). Revisit if a third impl emerges (e.g. server-side health-ping).
```

- [ ] **Step 5: Update the test count**

In the "Current state" block at the top, update the test count line. Run `pnpm test 2>&1 | tail -50` and extract the total. The line currently reads:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + ...
```

Update the unit count to reflect the new total. For example, if domain went 114 → 117 (state-machine +1, ConnectionEventsSimulator +2) and client went 22 → 33 (FakeWsAdapter +4, WsAdapter +5, WsConnectionEventsAdapter +2):

```
- **Test counts:** ~155 unit (~117 domain + ~33 client + 5 server) + ...
```

Use the actual numbers from the test run.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): flip Phase 5D to ✅ DONE

SHA range: <first-sha>..<last-sha>. 6 follow-ups recorded for 5E+.
Test count updated to reflect Phase 5D additions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Final verification**

Run: `git log origin/main..HEAD --oneline | wc -l`
Expected: **13 commits** (12 task commits + 1 STATUS update — Task 11's docs commit is part of the 12 task commits via Task 11; Task 12's STATUS commit is the +1).

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: PASS across the board.

---

## Done

Phase 5D is ready to ship. The standard finishing step (`superpowers:finishing-a-development-branch`) will offer push-to-origin/main, merge-locally, or keep-as-is.
