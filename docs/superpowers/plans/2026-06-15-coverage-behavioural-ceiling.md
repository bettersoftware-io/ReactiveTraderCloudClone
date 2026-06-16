# Drive All Coverage Tiers to Their Behavioural Ceiling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise every coverage tier toward its honest behavioural ceiling by adding behavioural tests + visual goldens — never impl-detail tests, ignore-pragmas, or production `src/` edits.

**Architecture:** Four independent phases (D domain, S server, A client-app, V visual), each merge-able on its own. Tier 4 (ui:contract, 99.2%/97.7%) is already at ceiling — no work, documented in the final report.

**Tech Stack:** Vitest 4 (v8 + istanbul), RxJS, `@rtc/shared` fixtures, `ws`, the visual three-runner harness (playwright-ct / playwright / vitest-browser).

**Reference spec:** `docs/superpowers/specs/2026-06-15-coverage-behavioural-ceiling-design.md`

**Branch:** `feat/coverage-behavioural-ceiling` (checked out; spec committed at `2109eb5`).

---

## Important notes for the implementer

- **Behaviour, not implementation.** Every test asserts an observable stimulus→output and must survive refactors. NO `v8 ignore` / `istanbul ignore` pragmas. NO production `src/` edits (tests + coverage config only).
- **Contract tests over already-shipped code PASS on first run.** A failing new test is a **real finding** — STOP and report it; never edit `src/` to force green, never weaken an assertion to match a suspicious output.
- **Honest-denominator config excludes are allowed** (not pragmas): bootstrap/wiring files excluded from a coverage config with a reason comment (same move already shipped for the server).
- **Commit trailer** on every commit: end the body with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Findings from plan authoring (already verified against source):**
  - **Phase S delivers 19 tests, not the spec's 21** — the handler has exactly **7** subscription error arms (not 9). Not a skipped gap; a spec miscount.
  - **Phase V delivers 21 deterministic scenarios, not the spec's 33** — 12 candidates are **testid-gated interaction states** (blotter sort/filter/popovers, RFQ "All" filter, new-RFQ form states) reachable only by clicking controls with **no `data-testid`**; the runner-neutral `scenarioActions` table keys on testids only, and adding testids is a production `src/` edit the policy forbids. Those 12 move to the documented EXCLUDED list (covered by the contract tier). **See the "Open decision" at the end** — authorizing testid-only additions could lift ~12 back in a follow-up.
  - Several spec-listed gaps were **already covered** and are dropped (Phase D: analytics rollover, dealer/instrument static-arm; Phase A: most RPC nack paths, disposed-onclose, reconnect-timer).

---

## Phase D — @rtc/domain behavioural tests

Run command (all tasks): `pnpm --filter @rtc/domain test`. These pass on first run.

**Dropped (already covered — verified):** AnalyticsSimulator history rollover (existing `AnalyticsSimulator.test.ts` line 49 drives the `shift()` arm); Dealer/Instrument `supportsLiveAdd:false` early-return (existing `*Simulator.contract.test.ts` return `false`).

**Finding to relay:** `CreditRfqSimulator.accept()` mutates competing quotes to `rejectedWithPrice` but emits **no event** and exposes no getter (CreditRfqSimulator.ts:191) — the rejection is unobservable through `WorkflowPort`. We cover the observable `quoteAccepted`+`rfqClosed` (which still executes the auto-reject loop); the unobservable transition is documented, not asserted.

### Task D1: CreditRfqSimulator port behaviour

**Files:** Create `packages/domain/src/simulators/CreditRfqSimulator.test.ts`

- [ ] **Step 1: Write the test file.** Asserts via the `events()` stream only (never private state); fake timers; `Math.random` stubbed only for the timer-path test.

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./creditReferenceDataSimulator.js";
import type { RfqEvent } from "../ports/workflowPort.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function collectEvents(sim: CreditRfqSimulator): { events: RfqEvent[]; stop: () => void } {
  const events: RfqEvent[] = [];
  const sub = sim.events().subscribe((e) => events.push(e));
  return { events, stop: () => sub.unsubscribe() };
}

async function createRfqAndQuoteId(sim: CreditRfqSimulator): Promise<{ rfqId: number; quoteId: number }> {
  const quoteCreated = firstValueFrom(
    sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(1)),
  );
  const rfqId = await firstValueFrom(
    sim.createRfq({
      instrumentId: 1,
      dealerIds: [DEALERS_CATALOG[0]!.id],
      quantity: 1000,
      direction: "Buy" as never,
      expirySecs: 60,
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  const e = (await quoteCreated) as Extract<RfqEvent, { type: "quoteCreated" }>;
  return { rfqId, quoteId: e.payload.id };
}

describe("CreditRfqSimulator", () => {
  it("cancelRfq closes an open RFQ via an rfqClosed event with Cancelled state", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { rfqId } = await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const closed = events.find((e) => e.type === "rfqClosed");
    expect(closed).toBeDefined();
    const payload = (closed as Extract<RfqEvent, { type: "rfqClosed" }>).payload;
    expect(payload.id).toBe(rfqId);
    expect(payload.state).toBe("Cancelled");
  });

  it("cancelRfq on an already-cancelled RFQ is a no-op (no further rfqClosed event)", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { rfqId } = await createRfqAndQuoteId(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "rfqClosed")).toBe(false);
  });

  it("pass moves a quote to passed and emits quotePassed", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { quoteId } = await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.pass(quoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const passed = events.find((e) => e.type === "quotePassed");
    expect(passed).toBeDefined();
    const payload = (passed as Extract<RfqEvent, { type: "quotePassed" }>).payload;
    expect(payload.id).toBe(quoteId);
    expect(payload.state.type).toBe("passed");
  });

  it("pass on an unknown quoteId is a no-op (no quotePassed event)", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.pass(999_999));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "quotePassed")).toBe(false);
  });

  it("accept on a multi-dealer RFQ emits quoteAccepted then closes the RFQ", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0); // force scheduled dealers to NOT participate
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const quoteCreatedTwice = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(2)),
    );
    const firstQuotePromise = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(1)),
    );
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [DEALERS_CATALOG[0]!.id, DEALERS_CATALOG[1]!.id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 60,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await quoteCreatedTwice;
    const winningQuoteId = ((await firstQuotePromise) as Extract<RfqEvent, { type: "quoteCreated" }>).payload.id;
    await firstValueFrom(sim.quote({ quoteId: winningQuoteId, price: 100 }));
    await vi.advanceTimersByTimeAsync(0);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.accept(winningQuoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const accepted = events.find((e) => e.type === "quoteAccepted");
    expect(accepted).toBeDefined();
    const acceptedPayload = (accepted as Extract<RfqEvent, { type: "quoteAccepted" }>).payload;
    expect(acceptedPayload.id).toBe(winningQuoteId);
    expect(acceptedPayload.state).toEqual({ type: "accepted", price: 100 });
    const closed = events.find((e) => e.type === "rfqClosed");
    expect(closed).toBeDefined();
    expect((closed as Extract<RfqEvent, { type: "rfqClosed" }>).payload.state).toBe("Closed");
  });

  it("accept on a quote without a price is a no-op", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { quoteId } = await createRfqAndQuoteId(sim); // pendingWithoutPrice
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.accept(quoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "quoteAccepted")).toBe(false);
    expect(events.some((e) => e.type === "rfqClosed")).toBe(false);
  });

  it("a simulated dealer responds within DEALER_RESPONSE_WINDOW_MS, pricing the quote", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // participates; delay 15s; price 100 + 5*-1 = 95
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const quoted = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteQuoted"), take(1)),
    );
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [DEALERS_CATALOG[0]!.id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 60,
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const e = (await quoted) as Extract<RfqEvent, { type: "quoteQuoted" }>;
    expect(e.payload.state.type).toBe("pendingWithPrice");
    expect(e.payload.state).toEqual({ type: "pendingWithPrice", price: 95 });
  });
});
```

Implementer notes: `direction: "Buy" as never` mirrors the existing contract test's cast (Direction imported as type only); if the real enum members differ, import + use the enum. The `price: 95` in the last test is the canary — a different value is a real finding (the `scheduleDealerResponse` formula changed), not a flake.

- [ ] **Step 2:** Run `pnpm --filter @rtc/domain test` → PASS.
- [ ] **Step 3:** Commit `test(domain): cover CreditRfqSimulator cancelRfq, pass, accept and dealer-response timer`.

### Task D2: connectionStatus CONNECTING + browserOffline

**Files:** Modify `packages/domain/src/connection/connectionStatus.test.ts`

- [ ] **Step 1:** Add inside the existing `describe("nextConnectionStatus", …)`:
```ts
  it("CONNECTING -> OFFLINE_DISCONNECTED on browserOffline", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "browserOffline" }),
    ).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
  });
```
- [ ] **Step 2:** Run → PASS. **Step 3:** Commit `test(domain): cover CONNECTING + browserOffline connection transition`.

### Task D3: PricingSimulator unknown-symbol + live history cap

**Files:** Modify `packages/domain/src/simulators/PricingSimulator.test.ts` (imports `firstValueFrom`/`lastValueFrom`/`take`/`toArray`/`vi`/`MAX_TICK_INTERVAL_MS`/`PRICE_HISTORY_SIZE` already present).

- [ ] **Step 1:** Add after the existing unknown-symbol test:
```ts
  it("getPriceUpdates throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(firstValueFrom(engine.getPriceUpdates("INVALID"))).rejects.toThrow("Unknown symbol");
  });

  it("getRfqQuote throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(firstValueFrom(engine.getRfqQuote("INVALID", 4))).rejects.toThrow("Unknown symbol");
  });

  it("live ticks keep the price history capped at PRICE_HISTORY_SIZE", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const consumed = lastValueFrom(
      engine.getPriceUpdates("EURUSD").pipe(take(PRICE_HISTORY_SIZE + 10), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 12);
    await consumed;
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    expect(history).toHaveLength(PRICE_HISTORY_SIZE);
  });
```
- [ ] **Step 2:** Run → PASS. **Step 3:** Commit `test(domain): cover PricingSimulator unknown-symbol on updates/rfq and live history cap`.

### Task D4: AnalyticsPort contract minimal-history arm

**Files:** Create `packages/domain/src/simulators/AnalyticsSimulator.minimalHistory.contract.test.ts`

- [ ] **Step 1:** Write (a single-entry-history `AnalyticsPort` stub drives the `history.length < 2` early-return arm):
```ts
import { of, type Observable } from "rxjs";
import { describeAnalyticsPortContract } from "../ports/__contracts__/AnalyticsPortContract.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";
import type { PositionUpdates } from "../analytics/position.js";

class SingleEntryAnalyticsStub implements AnalyticsPort {
  getAnalytics(_currency: string): Observable<PositionUpdates> {
    return of({ currentPositions: [], history: [{ timestamp: new Date().toISOString(), usdPnl: 0 }] });
  }
}

describeAnalyticsPortContract("SingleEntryAnalyticsStub", () => {
  const port = new SingleEntryAnalyticsStub();
  return { port, driver: { emitAnalytics: async () => {} }, teardown: () => {} };
});
```
Implementer: verify `describeAnalyticsPortContract`'s harness factory return shape against an existing caller before finalizing (`driver`/`teardown` keys); adjust to the real contract signature if it differs.
- [ ] **Step 2:** Run → PASS. **Step 3:** Commit `test(domain): cover AnalyticsPort contract minimal-history early-return arm`.

**Phase D ceiling:** CreditRfqSimulator ~90%+, connectionStatus ~100%, PricingSimulator ~95%+; domain aggregate low-to-mid 90s%. Residual = documented defensive arms (`scheduleDealerResponse` catch, random-participation early return).

---

## Phase S — @rtc/server behavioural tests (19 tests)

All tasks modify `packages/server/src/ws/wsHandler.test.ts`. Run: `pnpm --filter @rtc/server test`. Reuse `FakeWs`/`fakeServices`/`connect`/`wait`/`expectFrameShape`. `throwError`+`of` already imported; **add `vi`** to the vitest import in S1.

**Left untested (defensive, per policy):** the `send()` socket-closed guard (wsHandler.ts:30) and the in-`next` `if (ac.signal.aborted) return;` race guards — observable post-close behaviour already covered by the existing "stops streaming after close" test.

### Task S1: Stream-error callbacks (7 tests)

- [ ] **Step 1:** Change line 2 to `import { describe, it, expect, vi } from "vitest";`
- [ ] **Step 2:** Add a new `describe("wsHandler stream-error callbacks", …)` after the protocol block. Each test spies `console.error`, drives one failing stream, asserts the exact prefix + no frames (instruments/dealers assert only `added`/`endOfStateOfTheWorld` are absent — the synchronous `startOfStateOfTheWorld` marker still sends). Prefixes: `ReferenceData`/`Pricing`/`Blotter`/`Analytics`/`Instruments`/`Dealers`/`Workflow` + `" stream error:"`.

```ts
describe("wsHandler stream-error callbacks", () => {
  it("logs and emits no frames when referenceData stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      referenceData: { getCurrencyPairs: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["referenceData"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA });
    await wait();
    expect(spy).toHaveBeenCalledWith("ReferenceData stream error:", expect.any(Error));
    expect(ws.framesOfType(SERVER_MSG.REFERENCE_DATA)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when pricing stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      pricing: { getPriceUpdates: () => throwError(() => new Error("boom")), getPriceHistory: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["pricing"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } });
    await wait();
    expect(spy).toHaveBeenCalledWith("Pricing stream error:", expect.any(Error));
    expect(ws.framesOfType(SERVER_MSG.PRICE_TICK)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when blotter stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      blotter: { getTradeStream: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["blotter"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_BLOTTER });
    await wait();
    expect(spy).toHaveBeenCalledWith("Blotter stream error:", expect.any(Error));
    expect(ws.framesOfType(SERVER_MSG.BLOTTER)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when analytics stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      analytics: { getAnalytics: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["analytics"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_ANALYTICS, payload: { currency: "USD" } });
    await wait();
    expect(spy).toHaveBeenCalledWith("Analytics stream error:", expect.any(Error));
    expect(ws.framesOfType(SERVER_MSG.ANALYTICS)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no added frames when instruments stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      instruments: { getInstruments: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["instruments"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS });
    await wait();
    expect(spy).toHaveBeenCalledWith("Instruments stream error:", expect.any(Error));
    const types = ws.framesOfType(SERVER_MSG.INSTRUMENT_EVENT).map((m) => (m.payload as { type: string }).type);
    expect(types).not.toContain("added");
    expect(types).not.toContain("endOfStateOfTheWorld");
    spy.mockRestore();
  });

  it("logs and emits no added frames when dealers stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      dealers: { getDealers: () => throwError(() => new Error("boom")) } as unknown as ServiceContainer["dealers"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_DEALERS });
    await wait();
    expect(spy).toHaveBeenCalledWith("Dealers stream error:", expect.any(Error));
    const types = ws.framesOfType(SERVER_MSG.DEALER_EVENT).map((m) => (m.payload as { type: string }).type);
    expect(types).not.toContain("added");
    expect(types).not.toContain("endOfStateOfTheWorld");
    spy.mockRestore();
  });

  it("logs and emits no frames when workflow stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(fakeServices({
      workflow: { events: () => throwError(() => new Error("boom")), createRfq: () => of(1), cancelRfq: () => of(undefined), quote: () => of(undefined), pass: () => of(undefined), accept: () => of(undefined) } as unknown as ServiceContainer["workflow"],
    }));
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
    await wait();
    expect(spy).toHaveBeenCalledWith("Workflow stream error:", expect.any(Error));
    expect(ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT)).toHaveLength(0);
    spy.mockRestore();
  });
});
```
- [ ] **Step 3:** Run → PASS. **Step 4:** Commit `test(server): cover the 7 wsHandler stream-error callbacks`.

### Task S2: Workflow quote-transform branches (4 tests)

- [ ] **Step 1:** Add after S1's block:
```ts
describe("wsHandler workflow quote-event transforms", () => {
  const workflowEmitting = (event: RfqEvent): ServiceContainer["workflow"] => ({
    events: (): Observable<RfqEvent> => of(event),
    createRfq: () => of(1), cancelRfq: () => of(undefined), quote: () => of(undefined), pass: () => of(undefined), accept: () => of(undefined),
  } as unknown as ServiceContainer["workflow"]);

  const quoteEvent = (type: RfqEvent["type"]): RfqEvent => ({
    type, payload: { id: 7, rfqId: 3, dealerId: 2, state: { type: "pendingWithoutPrice" } },
  } as unknown as RfqEvent);

  for (const type of ["quoteCreated", "quoteQuoted", "quotePassed", "quoteAccepted"] as const) {
    it(`maps a ${type} RfqEvent to a stream.workflowEvent QuoteBodyDto frame`, async () => {
      const ws = connect(fakeServices({ workflow: workflowEmitting(quoteEvent(type)) }));
      ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
      await wait();
      const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
      expect(frame).toBeDefined();
      expect(frame!.type).toBe(SERVER_MSG.WORKFLOW_EVENT);
      const body = frame!.payload as { type: string; payload: { id: number; rfqId: number; dealerId: number; state: { type: string } } };
      expect(body.type).toBe(type);
      expect(body.payload).toEqual({ id: 7, rfqId: 3, dealerId: 2, state: { type: "pendingWithoutPrice" } });
    });
  }
});
```
- [ ] **Step 2:** Run → PASS. **Step 3:** Commit `test(server): cover wsHandler workflow quote-event transforms`.

### Task S3: RPC synchronous-throw catch blocks (8 tests)

- [ ] **Step 1:** Add after S2's block — each injects a service method that **throws synchronously** (`() => { throw new Error("boom") }`) and asserts a `nack` with the echoed `correlationId` for: executeTrade, getPriceHistory, createRfq, cancelRfq, quote, pass, accept, setThroughput. (Full code per the authored section: each `connect(fakeServices({ <slice>: { …throwing method…, …sibling stubs… } }))`, `ws.receive({ type, correlationId, payload })`, `await wait()`, assert `framesOfType(<RESPONSE>)[0].correlationId` + `.payload.type === "nack"`.) Workflow/pricing overrides include sibling stubs; setThroughput override is `{ getThroughput: () => 0, setThroughput: () => { throw … } }`.

```ts
describe("wsHandler RPC synchronous-throw handling", () => {
  it("nacks rpc.executeTrade when execution throws synchronously", async () => {
    const ws = connect(fakeServices({ execution: { executeTrade: () => { throw new Error("boom"); } } as unknown as ServiceContainer["execution"] }));
    ws.receive({ type: CLIENT_MSG.EXECUTE_TRADE, correlationId: "sync-exec", payload: { currencyPair: "EURUSD", spotRate: 1.1, direction: Direction.Buy, notional: 1_000_000, dealtCurrency: "EUR" } });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.EXECUTION_RESPONSE);
    expect(resp!.correlationId).toBe("sync-exec");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.getPriceHistory when pricing throws synchronously", async () => {
    const ws = connect(fakeServices({ pricing: { getPriceUpdates: () => of(), getPriceHistory: () => { throw new Error("boom"); } } as unknown as ServiceContainer["pricing"] }));
    ws.receive({ type: CLIENT_MSG.GET_PRICE_HISTORY, correlationId: "sync-ph", payload: { symbol: "EURUSD" } });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(resp!.correlationId).toBe("sync-ph");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  // createRfq / cancelRfq / quote / pass / accept: same shape, workflow slice with
  // the named method throwing synchronously + the other five workflow methods stubbed
  // (events:()=>of(), createRfq:()=>of(1), cancelRfq/quote/pass/accept:()=>of(undefined)).
  // Assert <CREATE_RFQ|CANCEL_RFQ|QUOTE|PASS|ACCEPT>_RESPONSE correlationId echo + nack.

  it("nacks admin.setThroughput when the throughput service throws synchronously", async () => {
    const ws = connect(fakeServices({ throughput: { getThroughput: () => 0, setThroughput: () => { throw new Error("boom"); } } as unknown as ServiceContainer["throughput"] }));
    ws.receive({ type: CLIENT_MSG.SET_THROUGHPUT, correlationId: "sync-tp", payload: { value: 42 } });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.SET_THROUGHPUT_RESPONSE);
    expect(resp!.correlationId).toBe("sync-tp");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });
});
```
Implementer: write out all 5 credit-RPC tests in full (createRfq/cancelRfq/quote/pass/accept) following the executeTrade/getPriceHistory pattern with the correct payload per CLIENT_MSG (createRfq: `{instrumentId,dealerIds,quantity,direction,expirySecs}`; cancelRfq: `{rfqId}`; quote: `{quoteId,price}`; pass/accept: `{quoteId}`).
- [ ] **Step 2:** Run → PASS (a missing nack on sync-throw = the `try` doesn't wrap the sync call → real finding). **Step 3:** Commit `test(server): cover wsHandler RPC synchronous-throw nack paths`.

**Phase S ceiling:** wsHandler.ts ~95%+ stmts / ~90%+ branches; `@rtc/server` ~92-95%. Residual = the 8 deliberately-left defensive guard lines.

---

## Phase A — @rtc/client src/app behavioural tests + composition exclude (11 tests + 1 config)

Iterate with `pnpm --filter @rtc/client test:app`; confirm coverage with `pnpm --filter @rtc/client test:app:coverage`. Reuse `MockWebSocket` (in `WsAdapter.test.ts`), `FakeWsAdapter`+`awaitPendingRpc` (in `src/app/adapters/__test__/`), `rpcNack` fixture.

**Dropped (already covered):** getPriceHistory/getRfqQuote/executeTrade/createRfq/cancelRfq/accept nack; WsAdapter disposed-onclose + reconnect-timer. **Left (defensive):** `BrowserConnectionEventsAdapter` idle-timer guard.

### Task A1: WsAdapter rpc + message routing (7 tests)

**Files:** Modify `packages/client/src/app/adapters/WsAdapter.test.ts` (append a `describe`, reuse the file's `MockWebSocket`/`lastMock`/fake-timer + `vi.stubGlobal("WebSocket",…)` harness).

- [ ] **Step 1:** Append the `describe("WsAdapter.rpc() + message routing", …)` block: malformed-JSON ignored; response with unknown correlationId routed to stream handler; `rpc()` rejects when socket not open (`/WebSocket not connected/`, `send` not called); in-flight `rpc()` resolves on correlated response (correlationId starts at `"1"`); `dispose()` rejects pending (`/WsAdapter disposed/`); `waitForConnection()` resolves when already open and once it transitions open (drive the 100ms poll with `vi.advanceTimersByTimeAsync(100)`). (Full code in the authored Phase A section.)

```ts
describe("WsAdapter.rpc() + message routing", () => {
  function open(adapter: WsAdapter): MockWebSocket {
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    return lastMock;
  }
  it("ignores a malformed (non-JSON) inbound frame without throwing", () => {
    const adapter = new WsAdapter("ws://test");
    const received: unknown[] = [];
    adapter.on("stream.priceTick", (p) => received.push(p));
    open(adapter);
    expect(() => lastMock.onmessage?.(new MessageEvent("message", { data: "not json{" }))).not.toThrow();
    expect(received).toEqual([]);
    adapter.dispose();
  });
  it("routes a response with an unknown correlationId to the stream handler", () => {
    const adapter = new WsAdapter("ws://test");
    const received: unknown[] = [];
    adapter.on("stream.priceTick", (p) => received.push(p));
    open(adapter);
    lastMock.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "stream.priceTick", payload: { symbol: "EURUSD" }, correlationId: "999" }) }));
    expect(received).toEqual([{ symbol: "EURUSD" }]);
    adapter.dispose();
  });
  it("rejects rpc() when the socket is not open", async () => {
    const adapter = new WsAdapter("ws://test");
    await expect(adapter.rpc("rpc.executeTrade", { foo: 1 })).rejects.toThrow(/WebSocket not connected/);
    expect(lastMock.send).not.toHaveBeenCalled();
    adapter.dispose();
  });
  it("resolves an in-flight rpc() when its correlated response arrives", async () => {
    const adapter = new WsAdapter("ws://test");
    open(adapter);
    const promise = adapter.rpc("rpc.executeTrade", { foo: 1 });
    lastMock.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "rpc.executeTrade.response", payload: { tradeId: 7 }, correlationId: "1" }) }));
    await expect(promise).resolves.toEqual({ tradeId: 7 });
    adapter.dispose();
  });
  it("dispose() rejects every pending rpc()", async () => {
    const adapter = new WsAdapter("ws://test");
    open(adapter);
    const pending = adapter.rpc("rpc.executeTrade", { foo: 1 });
    adapter.dispose();
    await expect(pending).rejects.toThrow(/WsAdapter disposed/);
  });
  it("waitForConnection() resolves immediately when already open", async () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    await expect(adapter.waitForConnection()).resolves.toBeUndefined();
    adapter.dispose();
  });
  it("waitForConnection() resolves once the socket transitions to open", async () => {
    const adapter = new WsAdapter("ws://test");
    const waited = adapter.waitForConnection();
    lastMock.readyState = MockWebSocket.OPEN;
    await vi.advanceTimersByTimeAsync(100);
    await expect(waited).resolves.toBeUndefined();
    adapter.dispose();
  });
});
```
Implementer: verify the real method names (`rpc`/`waitForConnection`/`dispose`/`on`) and reject messages against `WsAdapter.ts` before finalizing; use the actual API + error strings.
- [ ] **Step 2:** Run `test:app` → PASS; then `test:app:coverage` → PASS. **Step 3:** Commit `test(client): cover WsAdapter rpc + message-routing behaviours`.

### Task A2: portFactory simulator wiring + quote/pass nack (5 tests)

**Files:** Create `packages/client/src/app/adapters/portFactory.test.ts`.

- [ ] **Step 1:** Write `createSimulatorPorts` wiring tests (assert each of the 8 ports exposes a callable port method; assert a first blotter frame is emittable to prove live wiring) + `quote`/`pass` nack tests via `FakeWsAdapter`+`awaitPendingRpc`+`rpcNack` (reject `/Failed to submit quote/` and `/Failed to pass on quote/`). (Full code in the authored Phase A section.) Implementer: verify port method names + how nack surfaces (rejected promise vs errored observable) + `QuoteRequest` field names against source; a hung `firstValueFrom` on blotter = finding (relax to asserting `.subscribe` is a function + report).
- [ ] **Step 2:** Run `test:app` → PASS; `test:app:coverage` → PASS. **Step 3:** Commit `test(client): cover createSimulatorPorts wiring + quote/pass nack`.

### Task A3: RfqsPresenter allQuotes$, equality arms, cache (4 tests)

**Files:** Modify `packages/client/src/app/presenters/__tests__/RfqsPresenter.test.ts` (add `lastValueFrom`+`toArray` to the rxjs import; reuse the file's `rfq()`/`quote()`/`port()` builders).

- [ ] **Step 1:** Add: `allQuotes$` emits the quotes map; `rfqs$` re-emits across a length change (shallowArrayEquals length-mismatch arm); `quotesForRfq$` re-emits on element-identity change (element-diff arm); `quotesForRfq$(id)` returns the same Observable instance on repeat (cache hit) and a different one for a different id. (Full code in the authored Phase A section.) Implementer: confirm the "replace existing quote" event variant against `@rtc/domain` `RfqEvent`/`reduceRfqEvent`; if the reducer dedupes by identity making the element-diff arm unreachable, drop that one test as defensive + report.
- [ ] **Step 2:** Run `test:app` → PASS; `test:app:coverage` → PASS. **Step 3:** Commit `test(client): cover RfqsPresenter allQuotes$, equality arms, quotesForRfq$ cache`.

### Task A4: Exclude composition.ts from app coverage

**Files:** Modify `packages/client/vitest.app.coverage.config.ts`.

- [ ] **Step 1:** Add an `exclude` to the coverage block:
```ts
      coverage: {
        provider: "v8",
        include: ["src/app/**"],
        exclude: [
          // Composition root: import.meta.env detection + `new X()` port/presenter
          // wiring + DOM bootstrap; not unit-testable without a production refactor.
          // Covered by tests/fullstack + UI smokes. Mirrors the server's
          // src/index.ts / serviceContainer.ts coverage exclude.
          "src/app/composition.ts",
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
```
(Preserve the file's existing `include`/`reporter`/`reportsDirectory` values if they already match; only insert `exclude`.)
- [ ] **Step 2:** Run `test:app:coverage` → PASS; confirm `composition.ts` no longer in the table. **Step 3:** Commit `test(client): exclude composition.ts from app coverage (bootstrap)`.

**Phase A ceiling:** WsAdapter ~95%+, portFactory +10-15pt, RfqsPresenter ~100%; `src/app` mid-to-high 90s% after the composition exclude.

---

## Phase V — visual config narrowing + golden scenarios (21 deterministic scenarios)

Policy: only `tests/ui/visual/**` + the visual coverage config. Three runners; **two are manifest-driven** (`playwright/visual.spec.ts`, `vitest-browser/visual.spec.tsx` — a `scenarios.ts` entry auto-creates their tests), **one is hand-written** (`playwright-ct/*.spec.tsx` — every scenario needs a `mount` block). `:update` scripts: `test:ui:visual:{playwright-ct,playwright,vitest-browser}:react:update` (via `pnpm --filter @rtc/client`; `pnpm build` first). **This aarch64 container writes only `react-local/linux-arm64/`; the canonical x86 `react/` set is the `update-visual-goldens` GitHub workflow's job.**

**Excluded (documented, not snapshotted):** timer/transition states (`RfqCountdown`, `TileConfirmation`, `TileRfq`, `StaleIndicator` stale arm); unimplemented `system-preference` theme; `BlotterRow` hover; and the **12 testid-gated interaction states** (blotter sort/filter/popovers, RFQ "All" filter, new-RFQ form states) — see the Open decision.

### Task V1: Narrow the visual coverage denominator

**Files:** `packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts`

- [ ] **Step 1:** Narrow `include` to `["src/ui/**/*.tsx"]` and set `exclude` to the bootstrap + non-deterministic components (`HooksProvider.tsx`, `*.test.{ts,tsx}`, `RfqCountdown.tsx`, `TileConfirmation.tsx`, `TileRfq.tsx`, `shell/stale/StaleIndicator.tsx`), each with the reason comment from the authored Phase V section. (`*.tsx`-only include automatically drops the `.ts` logic/hook files.)
- [ ] **Step 2:** `pnpm build && pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`; confirm logic `.ts` files gone from the table + headline % jumped. **Step 3:** Commit (config only) `test(visual): narrow visual coverage denominator to presentational components`.

### Tasks V2–V9: Add the 21 scenarios

Each task: edit `shared/fixtures.ts` (mutate a real base fixture), `shared/scenarios.ts` (name → {componentKey, fixtureKey}), `react/registry.tsx` (new componentKey where noted), `scenarioActions.ts` (interaction scenarios only), and a hand-written `playwright-ct/<panel>.spec.tsx` `mount` block per scenario. Full fixture/registry/scenario code is in the authored Phase V section — implementer must verify every fixture field, `componentKey`, prop name, `RfqState`/`QuoteState` literal, and `testid` against the real source before writing.

- [ ] **V2 — FX tiles (4):** `tile/eurusd-down`, `tile/eurusd-flat` (reuse `Tile` key); `tile/chart-down`, `tile/chart-empty` (new `TileChart` registry key, `showChart={true}`). Fixture-driven.
- [ ] **V3 — FX live-rates (1):** `live-rates/price-view` — interaction (`scenarioActions: { click: "view-toggle", waitForText: "Chart" }`) + hand-written CT block.
- [ ] **V4 — FX analytics (3):** `analytics/negative-pnl`, `analytics/empty`, `analytics/flat-positions` (`AnalyticsPanel`). Fixture-driven.
- [ ] **V5 — Credit RFQ cards/quotes (6):** `credit/rfq-tiles-{done,expired,cancelled,accepted,passed}` (new `RfqCard` registry key, fixture-driven) + `credit/rfq-tiles-empty` (`RfqTilesPanel`).
- [ ] **V6 — Credit sell-side + blotter (4):** `credit/sell-side-{active,responded,empty}` (`SellSidePanel`) + `credit/blotter-empty` (`CreditBlotter`). Fixture-driven.
- [ ] **V7 — Credit workspace (2):** `credit/workspace-new-rfq`, `credit/workspace-sell-side` (new `CreditWorkspace` registry key; `scenarioActions` click `credit-tab-new-rfq`/`credit-tab-sell-side` — these testids exist) + hand-written CT blocks.
- [ ] **V8 — Admin (1):** `admin/panel-loaded` (new `AdminPanel` registry key; `scenarioActions: { stubThroughput: 250, waitForText: "Throughput Control" }`) + hand-written CT block.
- [ ] After each task: regenerate local goldens (V9 recipe) and commit harness + goldens together, green locally.

### Task V9: Generate local goldens + commit (batched)

- [ ] For each batch: `pnpm build` then the three `:update` scripts; `git status` must show ONLY `__screenshots__/react-local/linux-arm64/**` (+ harness) changed — **no `react/` files**. Then `pnpm --filter @rtc/client test:ui:visual:react` (no `:update`) → PASS. Commit batches: (1) FX tiles+live-rates, (2) FX analytics, (3) credit cards+sell-side+blotter, (4) credit workspace+admin.

### Task V10: Re-run coverage, refresh docs, document CI handoff

- [ ] **Step 1:** `pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage` → confirm `src/ui/**/*.tsx` ~95%+.
- [ ] **Step 2:** Refresh `tests/ui/visual/COVERAGE-GAPS.md` (dated 2026-06-15): drop now-covered rows; add a "Residual — deliberately unsnapshotted" section listing the timer/transition states + the 12 testid-gated interaction states, each with reason + the tier that covers it.
- [ ] **Step 3:** Update `tests/ui/visual/README.md` Coverage + Excluded-by-design sections.
- [ ] **Step 4:** Document in the commit body + (eventual) PR description: the canonical x86 `react/` goldens must be generated by the `update-visual-goldens` workflow on push — **visual CI stays red until then; expected, not a regression.** Commit `docs(visual): refresh COVERAGE-GAPS snapshot + README for new goldens`.

**Phase V ceiling:** after narrowing + 21 scenarios, ~93-96% stmts / ~88-92% br on `src/ui/**/*.tsx`. Residual = documented testid-gated + timer/transition states.

---

## Final verification

- [ ] **Affected suites pass:**
```bash
pnpm --filter @rtc/domain test
pnpm --filter @rtc/server test
pnpm --filter @rtc/client test:app
pnpm --filter @rtc/client test:ui:contract       # unchanged — still green
pnpm --filter @rtc/client test:ui:visual:react   # all new goldens pass locally
```
- [ ] **Coverage rose per tier:**
```bash
pnpm --filter @rtc/domain test:coverage
pnpm --filter @rtc/server test:coverage
pnpm --filter @rtc/client test:app:coverage
pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage
```
- [ ] **No production `src/` edits:**
```bash
git diff --name-only main...HEAD | grep -E 'packages/(domain|server|client)/src/' | grep -v -E '(\.test\.ts|\.contract\.test\.ts)$'
```
Expected: EMPTY (only test files under `src/` changed). If anything else appears, a production file was edited — revert it.
- [ ] **No ignore-pragmas added:**
```bash
git diff main...HEAD | grep -E '(istanbul ignore|v8 ignore|c8 ignore)'
```
Expected: EMPTY.
- [ ] **Write the residual-coverage note** (per success criterion 6): a short section in the final report listing, per tier, what was left uncovered and why (defensive / bootstrap / non-deterministic / testid-gated).

---

## Notes for the implementer

- **Contract/characterization tests over existing code PASS first run** — a red new test is a real finding, never a reason to edit `src/` or weaken an assertion.
- **YAGNI:** dropped gaps (already-covered, defensive, unobservable) are deliberately not tested — do not invent tests for them.
- **Phase V is the largest and has the CI-golden caveat** — only `react-local/linux-arm64/` here; `react/` via the workflow.
- **No CI gate, no `turbo.json` change, no production `src/` edit, no `@rtc/shared` change.**
