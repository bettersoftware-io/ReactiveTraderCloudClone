# Server Wire-Protocol Contract Tests + Domain Value-Object Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the server's WebSocket wire protocol with behavioural contract tests covering every `CLIENT_MSG → SERVER_MSG` mapping, add a behavioural test for the one domain value-object with real logic, and make the server coverage denominator honest by excluding un-unit-testable bootstrap.

**Architecture:** Extend the existing `packages/server/src/ws/wsHandler.test.ts` (reusing its `FakeWs`/`fakeServices`/`connect` harness) into a full wire-protocol contract suite. Assertions compare emitted frames against the canonical `@rtc/shared/__fixtures__/wireFrames.ts` shapes via a small `expectFrameShape` helper — the same fixture spine the client adapter contract tests use — so a wire-shape change breaks both ends together. Tests pin frames-in → frames-out only; never handler internals.

**Tech Stack:** Vitest 4, RxJS, `@rtc/shared` wire DTOs + fixtures, the `ws` `WebSocket` type.

**Reference spec:** `docs/superpowers/specs/2026-06-14-server-wire-contract-tests-design.md`

**Branch:** `feat/server-wire-contract-tests` (already checked out; spec already committed at `03fa298`).

---

## Important notes for the implementer

- **These are contract tests over ALREADY-IMPLEMENTED production code.** The classic TDD "write a failing test first" does NOT apply: each new test should **PASS on first run** because it pins behaviour the handler already has. If a new test FAILS, that is a real finding — the handler and the `@rtc/shared` contract disagree. STOP and report it; do NOT edit production `src/` to force green (hard constraint), and do NOT weaken the assertion to match a suspicious output without flagging it.
- **No production `src/` edits.** Only test files and the server vitest coverage config.
- **DRY:** every new frame-shape assertion goes through the `expectFrameShape` helper from Task 1. Reuse the existing `FakeWs`/`connect`/`wait` helpers — do not add a second fake socket.
- The existing 8 tests stay as-is (they pass). New tests are added alongside them.

---

## File Structure

**Modify:**
- `packages/server/src/ws/wsHandler.test.ts` — add the `expectFrameShape` shape helper, extend `fakeServices` with the missing workflow RPC methods + richer stream defaults, and add the new contract tests (subscriptions, RPCs, admin).
- `packages/server/vitest.config.ts` — add `coverage.exclude` for `src/index.ts` + `src/services/serviceContainer.ts`.

**Create:**
- `packages/domain/src/fx/currencyPair.test.ts` — behavioural test for `deriveBaseTerm` + `KNOWN_CURRENCY_PAIRS` invariants.

**Out of scope (do not touch):** any production `src/` file, `turbo.json`, CI workflows, the client/visual tiers, `CreditRfqSimulator`, the type-only domain files (`position.ts`, `creditTrade.ts`, `instrument.ts`, `dealer.ts`, `rfq.ts`).

---

### Task 1: Shape helper + harness extensions

**Files:**
- Modify: `packages/server/src/ws/wsHandler.test.ts`

- [ ] **Step 1: Add the `@rtc/shared` fixtures import**

At the top of `wsHandler.test.ts`, alongside the existing imports, add the canonical fixture import and extend the `@rtc/domain` import with `RfqEvent`:

```ts
import { Direction, TradeStatus, type RfqEvent } from "@rtc/domain";
import {
  priceTickFrame,
  priceHistoryResponse,
  executionResponseAck,
  rpcNack,
  rpcAck,
  tradeFrame,
  blotterFrame,
  analyticsFrame,
  dealerAdded,
  workflowEventCreated,
} from "@rtc/shared/__fixtures__/wireFrames";
```

(Replace the existing `import { Direction, TradeStatus } from "@rtc/domain";` line with the version above. Leave the other imports intact. `priceTickFrame`/`tradeFrame`/`executionResponseAck` may already be unused initially — they are used by later tasks; if your linter fails the build on unused imports, add each fixture import in the task that first uses it instead. Verify the subpath resolves: the client tests import from `@rtc/shared/__fixtures__/wireFrames`, so the export exists.)

- [ ] **Step 2: Add the shape-assertion helper**

Add this near the top of the file, after the `wait` helper (around line 51), before the fake services section:

```ts
// ── Wire-shape contract helper ───────────────────────────────────

/**
 * Recursively asserts `actual` has the SAME shape (key set + value types) as
 * `canonical` — NOT the same values (stream payloads are simulator-random).
 * Arrays are checked element-shape against the first canonical element. This
 * ties the server's emitted frames to the @rtc/shared fixture spine without
 * coupling to non-deterministic values or to handler internals.
 */
function expectShape(actual: unknown, canonical: unknown, path = "payload"): void {
  if (Array.isArray(canonical)) {
    expect(Array.isArray(actual), `${path} should be an array`).toBe(true);
    const arr = actual as unknown[];
    if (canonical.length > 0 && arr.length > 0) {
      expectShape(arr[0], canonical[0], `${path}[0]`);
    }
    return;
  }
  if (canonical !== null && typeof canonical === "object") {
    expect(
      actual !== null && typeof actual === "object",
      `${path} should be an object`,
    ).toBe(true);
    const obj = actual as Record<string, unknown>;
    for (const key of Object.keys(canonical as Record<string, unknown>)) {
      expect(obj, `${path} missing key "${key}"`).toHaveProperty(key);
      expectShape(obj[key], (canonical as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  expect(typeof actual, `${path} type`).toBe(typeof canonical);
}

/** Assert a frame has the expected protocol type and a payload matching the canonical wire shape. */
function expectFrameShape(frame: WsMessage | undefined, type: string, canonicalPayload: unknown): void {
  expect(frame, `expected a ${type} frame`).toBeDefined();
  expect(frame!.type).toBe(type);
  expectShape(frame!.payload, canonicalPayload, "payload");
}
```

- [ ] **Step 3: Add a self-test for the helper**

So the helper itself is trusted, add a tiny describe block. Place it at the very end of the file, after the existing `describe("wsHandler protocol", ...)` block:

```ts
describe("expectShape helper", () => {
  it("passes when shapes match regardless of values", () => {
    expect(() => expectShape({ a: 1, b: "x" }, { a: 99, b: "y" })).not.toThrow();
  });
  it("passes for nested objects and arrays by element shape", () => {
    expect(() =>
      expectShape({ xs: [{ n: 5 }] }, { xs: [{ n: 0 }] }),
    ).not.toThrow();
  });
  it("fails when a key is missing", () => {
    expect(() => expectShape({ a: 1 }, { a: 1, b: 2 })).toThrow();
  });
  it("fails when a value type differs", () => {
    expect(() => expectShape({ a: "1" }, { a: 1 })).toThrow();
  });
});
```

- [ ] **Step 4: Extend `fakeServices` with workflow RPC methods + richer stream defaults**

The current `fakeServices` base stubs streams as empty (`getTradeStream: () => of([])`, `getDealers: () => of([])`, `getAnalytics` with empty arrays, `getPriceHistory: () => of([])`) and `workflow` only has `events: () => of()`. Subscription/RPC contract tests need non-empty payloads to assert element shapes, and the workflow RPCs need methods. Replace the `blotter`, `analytics`, `instruments` stays as-is, `dealers`, `pricing.getPriceHistory`, and `workflow` entries in the `base` object with the enriched versions below (keep `referenceData`, `pricing.getPriceUpdates`, `execution`, `instruments`, `throughput` exactly as they are):

```ts
    pricing: {
      getPriceUpdates: (symbol: string): Observable<unknown> =>
        interval(PRICE_TICK_MS).pipe(
          map(() => ({
            symbol,
            bid: 1.0998,
            ask: 1.1002,
            mid: 1.1,
            valueDate: "2026-01-01",
            creationTimestamp: 1,
          })),
        ),
      getPriceHistory: () =>
        of([
          {
            symbol: "EURUSD",
            bid: 1.0998,
            ask: 1.1002,
            mid: 1.1,
            valueDate: "2026-01-01",
            creationTimestamp: 1,
          },
        ]),
    },
```

```ts
    blotter: {
      getTradeStream: () =>
        of([
          {
            tradeId: 1,
            tradeName: "RTC",
            currencyPair: "EURUSD",
            notional: 1_000_000,
            dealtCurrency: "EUR",
            direction: Direction.Buy,
            spotRate: 1.1,
            status: TradeStatus.Done,
            tradeDate: "2026-01-01",
            valueDate: "2026-01-01",
          },
        ]),
    },
    analytics: {
      getAnalytics: () =>
        of({
          currentPositions: [
            { symbol: "EURUSD", basePnl: 1, baseTradedAmount: 2, counterTradedAmount: 3 },
          ],
          history: [{ timestamp: "2026-01-01T00:00:00.000Z", usdPnl: 4 }],
        }),
    },
```

```ts
    dealers: {
      getDealers: () => of([{ id: 1, name: "Acme Bank" }]),
    },
    workflow: {
      events: (): Observable<RfqEvent> =>
        of({
          type: "rfqCreated",
          payload: {
            id: 1,
            instrumentId: 1,
            quantity: 1_000_000,
            direction: Direction.Buy,
            state: "Open",
            expirySecs: 120,
            creationTimestamp: 1,
          },
        } as unknown as RfqEvent),
      createRfq: () => of(1),
      cancelRfq: () => of(undefined),
      quote: () => of(undefined),
      pass: () => of(undefined),
      accept: () => of(undefined),
    },
```

(`as unknown as RfqEvent` avoids a `const enum RfqState` import; the handler's transform only reads the fields through, so the literal `"Open"` is fine for a shape test.)

- [ ] **Step 5: Run the suite — existing tests + helper self-test pass**

Run: `pnpm --filter @rtc/server test`
Expected: PASS. The original 8 `wsHandler protocol` tests still pass (the enriched fakes don't touch the services they use), and the 4 new `expectShape helper` tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws/wsHandler.test.ts
git commit -m "test(server): add wire-shape contract helper + extend wsHandler test fakes"
```
End the commit body with a blank line then:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

### Task 2: Subscription contract tests (blotter, analytics, dealers, workflow)

**Files:**
- Modify: `packages/server/src/ws/wsHandler.test.ts`

- [ ] **Step 1: Add the four subscription contract tests**

Inside `describe("wsHandler protocol", ...)`, after the existing `subscribe.instruments` test, add:

```ts
  it("routes subscribe.blotter to a stream.blotter frame matching the BlotterMessage shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_BLOTTER });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.BLOTTER);
    expectFrameShape(frame, SERVER_MSG.BLOTTER, blotterFrame([tradeFrame()]));
    expect((frame!.payload as { isStateOfTheWorld: boolean }).isStateOfTheWorld).toBe(true);
  });

  it("routes subscribe.analytics to a stream.analytics frame matching the AnalyticsDto shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_ANALYTICS, payload: { currency: "USD" } });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.ANALYTICS);
    expectFrameShape(frame, SERVER_MSG.ANALYTICS, analyticsFrame());
  });

  it("brackets subscribe.dealers with SoW markers and emits added DealerDto events", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_DEALERS });
    await wait();

    const frames = ws.framesOfType(SERVER_MSG.DEALER_EVENT);
    const types = frames.map((m) => (m.payload as { type: string }).type);
    expect(types[0]).toBe("startOfStateOfTheWorld");
    expect(types).toContain("added");
    expect(types).toContain("endOfStateOfTheWorld");
    expect(types.indexOf("startOfStateOfTheWorld")).toBeLessThan(
      types.indexOf("endOfStateOfTheWorld"),
    );
    const added = frames.find((m) => (m.payload as { type: string }).type === "added");
    expectFrameShape(added, SERVER_MSG.DEALER_EVENT, dealerAdded());
  });

  it("routes subscribe.workflow to a stream.workflowEvent frame matching the WorkflowEvent shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
    expectFrameShape(frame, SERVER_MSG.WORKFLOW_EVENT, workflowEventCreated(1));
  });
```

- [ ] **Step 2: Run and verify they pass**

Run: `pnpm --filter @rtc/server test`
Expected: PASS — all four new subscription tests green (the handler already emits these shapes; the test pins them). If any fails, the handler's emitted shape disagrees with the `@rtc/shared` fixture — report it, do not force green.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ws/wsHandler.test.ts
git commit -m "test(server): contract-test blotter/analytics/dealers/workflow subscription frames"
```
End the commit body with a blank line then the `Co-Authored-By` trailer (as in Task 1).

---

### Task 3: RPC contract tests (getPriceHistory, createRfq, cancelRfq, quote, pass, accept)

Each RPC test asserts: the matching `*.response` type, the `correlationId` is echoed, the ack payload matches the `@rtc/shared` shape, and the nack path on service failure.

**Files:**
- Modify: `packages/server/src/ws/wsHandler.test.ts`

- [ ] **Step 1: Add the FX `getPriceHistory` RPC tests**

After the existing `rpc.executeTrade` nack test, add:

```ts
  it("answers rpc.getPriceHistory with an ack echoing correlationId and a prices payload", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.GET_PRICE_HISTORY, correlationId: "ph-1", payload: { symbol: "EURUSD" } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(resp!.correlationId).toBe("ph-1");
    expectFrameShape(resp, SERVER_MSG.PRICE_HISTORY_RESPONSE, priceHistoryResponse("EURUSD", 1));
  });

  it("answers rpc.getPriceHistory with a nack when the service fails", async () => {
    const failing = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["pricing"];
    const ws = connect(fakeServices({ pricing: failing }));
    ws.receive({ type: CLIENT_MSG.GET_PRICE_HISTORY, correlationId: "ph-2", payload: { symbol: "EURUSD" } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(resp!.correlationId).toBe("ph-2");
    expectFrameShape(resp, SERVER_MSG.PRICE_HISTORY_RESPONSE, rpcNack());
  });
```

- [ ] **Step 2: Add the credit RPC tests (createRfq, cancelRfq, quote, pass, accept)**

Append after the `getPriceHistory` tests. These five share a pattern; each is written out in full (do not collapse — readability over cleverness):

```ts
  it("answers rpc.createRfq with an ack carrying the rfqId and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-1",
      payload: { instrumentId: 1, dealerIds: [1], quantity: 1_000_000, direction: Direction.Buy, expirySecs: 120 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("rfq-1");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcAck(1));
  });

  it("answers rpc.createRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      createRfq: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-2",
      payload: { instrumentId: 1, dealerIds: [1], quantity: 1_000_000, direction: Direction.Buy, expirySecs: 120 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("rfq-2");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcNack());
  });

  it("answers rpc.cancelRfq with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.CANCEL_RFQ, correlationId: "cx-1", payload: { rfqId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("cx-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.cancelRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      cancelRfq: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.CANCEL_RFQ, correlationId: "cx-2", payload: { rfqId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("cx-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.quote with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.QUOTE, correlationId: "q-1", payload: { quoteId: 1, price: 100 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(resp!.correlationId).toBe("q-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.quote with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      quote: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.QUOTE, correlationId: "q-2", payload: { quoteId: 1, price: 100 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(resp!.correlationId).toBe("q-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.pass with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.PASS, correlationId: "p-1", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(resp!.correlationId).toBe("p-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.pass with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      pass: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.PASS, correlationId: "p-2", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(resp!.correlationId).toBe("p-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.accept with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.ACCEPT, correlationId: "a-1", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(resp!.correlationId).toBe("a-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.accept with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      accept: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.ACCEPT, correlationId: "a-2", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(resp!.correlationId).toBe("a-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });
```

- [ ] **Step 2b: Note on the void-ack assertions**

`cancelRfq`/`quote`/`pass`/`accept` acks carry no payload body beyond `{ type: "ack" }`, so they assert the discriminant directly rather than via `expectFrameShape` (there is no DTO shape to compare). `createRfq` carries the `rfqId` number, asserted via `rpcAck(1)`. This is intentional, not an omission.

- [ ] **Step 3: Run and verify**

Run: `pnpm --filter @rtc/server test`
Expected: PASS — all new RPC ack + nack tests green. A failure means a real handler/contract mismatch — report it.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/ws/wsHandler.test.ts
git commit -m "test(server): contract-test all FX + credit RPC ack/nack frames"
```
End with the `Co-Authored-By` trailer.

---

### Task 4: Admin contract tests (getThroughput, setThroughput)

`throughput` in `fakeServices` is the real `ThroughputService`, so these assert genuine behaviour: set-then-get observes the state change through the API.

**Files:**
- Modify: `packages/server/src/ws/wsHandler.test.ts`

- [ ] **Step 1: Add the admin tests**

Append inside `describe("wsHandler protocol", ...)` after the RPC tests:

```ts
  it("answers admin.getThroughput with an ack carrying a numeric value and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-1" });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect(resp!.correlationId).toBe("tp-1");
    const body = resp!.payload as { type: string; payload: number };
    expect(body.type).toBe("ack");
    expect(typeof body.payload).toBe("number");
  });

  it("acks admin.setThroughput and the new value is observable via getThroughput", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SET_THROUGHPUT, correlationId: "tp-2", payload: { value: 42 } });
    await wait();

    const [setResp] = ws.framesOfType(SERVER_MSG.SET_THROUGHPUT_RESPONSE);
    expect(setResp!.correlationId).toBe("tp-2");
    expect((setResp!.payload as { type: string }).type).toBe("ack");

    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-3" });
    await wait();
    const [getResp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect((getResp!.payload as { type: string; payload: number }).payload).toBe(42);
  });
```

- [ ] **Step 2: Run and verify**

Run: `pnpm --filter @rtc/server test`
Expected: PASS. If `setThroughput(42)` does not round-trip to `getThroughput`, that is a real behavioural finding — report it.

- [ ] **Step 3: Confirm the full CLIENT_MSG matrix is now covered**

Run: `pnpm --filter @rtc/server test:coverage`
Expected: the coverage table shows `wsHandler.ts` substantially higher than before (the ~30% baseline). Every `CLIENT_MSG` type now has at least one contract test. (No exact threshold — report-only.)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/ws/wsHandler.test.ts
git commit -m "test(server): contract-test admin getThroughput/setThroughput frames"
```
End with the `Co-Authored-By` trailer.

---

### Task 5: Domain value-object behavioural test (currencyPair)

Of the six domain files named in the spec, inspection shows five are type-only or const-only (`analytics/position.ts`, `credit/creditTrade.ts`, `credit/instrument.ts` are pure interfaces; `credit/dealer.ts` is an interface + one name constant; `credit/rfq.ts` is an interface + a `const enum` + two numeric constants). They carry **no runtime logic**; a test would either have nothing to execute or assert a constant's literal value (a change-detector test that breaks on intentional change — exactly what the "behaviour not implementation" rule forbids). Only `fx/currencyPair.ts` has real logic (`deriveBaseTerm` + the `KNOWN_CURRENCY_PAIRS` catalog).

**Files:**
- Create: `packages/domain/src/fx/currencyPair.test.ts`

- [ ] **Step 1: Write the behavioural test**

Create `packages/domain/src/fx/currencyPair.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveBaseTerm, KNOWN_CURRENCY_PAIRS } from "./currencyPair.js";

describe("deriveBaseTerm", () => {
  it("splits a 6-letter symbol into its base and terms currencies", () => {
    expect(deriveBaseTerm("EURUSD")).toEqual({ base: "EUR", terms: "USD" });
    expect(deriveBaseTerm("GBPJPY")).toEqual({ base: "GBP", terms: "JPY" });
  });
});

describe("KNOWN_CURRENCY_PAIRS", () => {
  it("every pair's symbol is the concatenation of its base and terms", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.symbol).toBe(`${pair.base}${pair.terms}`);
      expect(deriveBaseTerm(pair.symbol)).toEqual({ base: pair.base, terms: pair.terms });
    }
  });

  it("every pair declares a positive rate precision, pips position, and default notional", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.ratePrecision).toBeGreaterThan(0);
      expect(pair.pipsPosition).toBeGreaterThan(0);
      expect(pair.defaultNotional).toBeGreaterThan(0);
    }
  });
});
```

These pin **relationships** (symbol = base+terms, derivation round-trips, invariants hold), not specific catalog values — so they survive adding/removing pairs but catch a typo'd entry.

- [ ] **Step 2: Run and verify**

Run: `pnpm --filter @rtc/domain test`
Expected: PASS — the new `currencyPair` tests green alongside the existing domain suite.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/fx/currencyPair.test.ts
git commit -m "test(domain): behavioural tests for deriveBaseTerm + currency-pair catalog invariants"
```
End with the `Co-Authored-By` trailer.

---

### Task 6: Honest server coverage denominator

**Files:**
- Modify: `packages/server/vitest.config.ts`

- [ ] **Step 1: Add the coverage exclude**

In `packages/server/vitest.config.ts`, add an `exclude` to the `coverage` block (it currently has `provider`, `include`, `reporter`, `reportsDirectory`). The block becomes:

```ts
    coverage: {
      provider: "v8",
      // Count every src file (even ones no test imports) so wholly-untested
      // modules surface at 0% rather than vanishing from the denominator.
      include: ["src/**"],
      exclude: [
        "src/index.ts", // HTTP/WS bootstrap; binds a port on import, not unit-testable
                        // without a production refactor — covered by tests/fullstack smokes
        "src/services/serviceContainer.ts", // pure `new X()` wiring; covered by the smokes
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
```

- [ ] **Step 2: Run coverage and confirm the denominator dropped the bootstrap**

Run: `pnpm --filter @rtc/server test:coverage`
Expected: the coverage table no longer lists `index.ts` or `serviceContainer.ts` rows; remaining files (`wsHandler.ts`, `ThroughputService.ts`) show meaningfully higher coverage than the ~27% baseline.

- [ ] **Step 3: Commit**

```bash
git add packages/server/vitest.config.ts
git commit -m "test(server): exclude un-unit-testable bootstrap from the coverage denominator"
```
End with the `Co-Authored-By` trailer.

---

## Final verification

- [ ] **Run the affected package suites + coverage, clean:**

```bash
pnpm --filter @rtc/server test
pnpm --filter @rtc/domain test
pnpm --filter @rtc/server test:coverage
pnpm --filter @rtc/domain test:coverage
```
Expected: all pass; server coverage table excludes bootstrap and shows `wsHandler.ts` substantially higher than baseline.

- [ ] **Confirm no production `src/` files changed:**

```bash
git diff --name-only main...HEAD | grep -E 'packages/(server|domain)/src/' | grep -v '\.test\.ts$'
```
Expected: NO output (only `*.test.ts` files under `src/` changed). If anything else appears, a production file was edited — revert it.

- [ ] **Confirm out-of-scope files are untouched:**

```bash
git diff --name-only main...HEAD
```
Expected: only `packages/server/src/ws/wsHandler.test.ts`, `packages/domain/src/fx/currencyPair.test.ts`, `packages/server/vitest.config.ts`, and the spec/plan docs. No `turbo.json`, no CI workflow, no client/visual files, no `@rtc/shared` change.

---

## Notes for the implementer

- **Contract tests over existing code pass first run** — see the top note. A red new test is a real finding, never a reason to edit production code.
- **DRY:** all frame-shape assertions go through `expectFrameShape`; the void-acks (`cancelRfq`/`quote`/`pass`/`accept`) assert the discriminant directly because they have no DTO body.
- **YAGNI:** Piece 2 is one file — the other five domain files are type-only/const-only and are deliberately not tested (testing them would violate the behaviour-not-implementation rule). Do not invent tests for them.
- **No CI gate, no `turbo.json` change, no production `src/` edits, no `@rtc/shared` change.**
