# Phase 5C — Port Contract Tests (Simulator vs WsReal) Design

**Date:** 2026-05-18
**Status:** Spec (pending plan + execution)
**Phase:** 5C — Port contract tests (simulator vs WsReal)
**Predecessor phases:** 5B.4 (vitest-plain) DONE on 2026-05-17

## Goal

Prove that, for each of the 8 transport ports (`ReferenceDataPort`, `PricingPort`, `ExecutionPort`, `BlotterPort`, `AnalyticsPort`, `InstrumentPort`, `DealerPort`, `WorkflowPort`), the simulator implementation in `packages/domain/src/simulators/` and the WsReal implementation in `packages/client/src/app/adapters/portFactory.ts` produce equivalent observable behavior on the happy path. TypeScript already proves the *types* match; this phase proves the *behavior* matches.

## Why now

Today, two implementations claim to satisfy each port interface, but no test exercises both against the same expectations. A presenter or use-case behaves correctly against the simulator in dev and is assumed to behave correctly against WsReal in prod, with no automated check enforcing that assumption. Phase 5C closes that gap so the "make choices, defer commitment" property of port interfaces is not just structural but behavioral.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│ packages/domain/src/ports/__contracts__/                                   │
│   <Port>Contract.ts × 8   (pure describers — depend only on rxjs + types)  │
│   shared between domain's simulator tests and client's WsReal tests        │
├────────────────────────────────────────────────────────────────────────────┤
│ packages/shared/src/__fixtures__/                                          │
│   wireFrames.ts          (typed factories: priceTickFrame(sym),            │
│                          referenceDataFrame(), tradeFrame(opts), …)        │
│                          consumed by FakeWsAdapter; available for future   │
│                          server tests to share the same canonical frames   │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ packages/domain/src/simulators/      │ packages/client/src/app/adapters/   │
│   <Sim>.contract.test.ts × 8         │   wsReal<Port>.contract.test.ts × 8 │
│   (call describer + simulator harn.) │   (call describer + wsReal harness) │
│                                      │   __test__/FakeWsAdapter.ts         │
│                                      │   wsReal<Port>.errors.test.ts × 3   │
│                                      │   (RPC-shaped ports only)           │
└──────────────────────────────────────┴─────────────────────────────────────┘
```

Dependency flow respects the existing inward-only rule:

- `packages/domain` exposes contract describers via its `exports` map. Describers depend only on `rxjs`, `vitest`, and domain port types.
- `packages/client` consumes describers via `@rtc/domain/ports/__contracts__/<Port>Contract` and provides per-impl harnesses that wire the FakeWsAdapter.
- `packages/shared` hosts the wire-fixture file, already a dependency of both `client` and `server`, so fixtures stay in lock-step with DTO types.

## Components

| File / folder | Count | Role |
|---|---|---|
| `packages/domain/src/ports/__contracts__/<Port>Contract.ts` | 8 | Per-port describer: `describe<Port>Contract(label, makeHarness)`. Pure: imports `vitest`, `rxjs`, port type. |
| `packages/shared/src/__fixtures__/wireFrames.ts` | 1 | Typed factories returning canonical server frames for each `SERVER_MSG.*` type. Source of truth shared by `FakeWsAdapter`. |
| `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts` | 1 | Mirrors `WsAdapter` API (`on`, `send`, `rpc`, `close`) + test-only `emit(type, payload)` and `nextRpcResponse(response)`. Pure in-memory, no real WebSocket. `implements IWsAdapter`. |
| `packages/client/src/app/adapters/IWsAdapter.ts` (or extracted from WsAdapter) | 1 | TS interface that both `WsAdapter` and `FakeWsAdapter` implement. Enforces method-signature parity. |
| `packages/domain/src/simulators/<Sim>.contract.test.ts` | 8 | Per-simulator contract test file. Builds harness around the simulator, calls describer. |
| `packages/client/src/app/adapters/wsReal<Port>.contract.test.ts` | 8 | Per-WsReal-port contract test file. Builds `FakeWsAdapter` + `createWsRealPorts(ws)`, wires driver methods to `ws.emit(...)`/`ws.nextRpcResponse(...)`. |
| `packages/client/src/app/adapters/wsReal<Port>.errors.test.ts` | 3 | RPC nack-path tests for Execution, Pricing, Workflow. Not part of the cross-impl contract. |

## Per-port contract surface

| Port | Happy-path invariants asserted by the contract |
|---|---|
| **ReferenceData** | (1) emits ≥1 snapshot of `readonly CurrencyPair[]`; (2) snapshot contains EURUSD + GBPUSD + NZDUSD; (3) each pair has full shape `{symbol, base, term, ratePrecision, pipsPosition, defaultNotional}`; (4) `NZDUSD.defaultNotional === 10_000_000` (the divergent rule); (5) two subscribers receive equivalent snapshots. |
| **Pricing** | `getPriceUpdates(sym)`: (1) emits ticks with `bid < mid < ask`; (2) a tick for symbol A is not delivered to a subscriber of symbol B. `getPriceHistory(sym)`: (3) emits one `readonly PriceTick[]` then completes. `getRfqQuote(sym, pipsPos)`: (4) emits one `{bid, mid, ask}` then completes; same ordering invariant. |
| **Execution** | (1) `executeTrade(req)` emits exactly one `Trade` then completes; (2) returned trade preserves `currencyPair`/`direction`/`notional`/`dealtCurrency`/`spotRate` from request; (3) `status` ∈ `{Done, Rejected, CreditExceeded, Timeout}`; (4) two concurrent `executeTrade` calls produce two independent observables with distinct `tradeId`s. |
| **Blotter** | (1) emits cumulative snapshots — after a new trade, the next snapshot contains prior trades + new; (2) initial emission arrives within a reasonable time (may be empty); (3) two subscribers eventually receive equivalent snapshots. |
| **Analytics** | (1) emits `PositionUpdates` with `currentPositions: Position[]` + `history: HistoryEntry[]`; (2) `history` is time-ordered; (3) currency filter respected — analytics for `"USD"` ≠ analytics for `"EUR"`. |
| **Instrument** | SoW protocol: (1) subscriber receives one initial snapshot of the full current set; (2) on add/remove, subscriber receives a new snapshot containing the full updated set (not a delta); (3) two subscribers eventually converge to the same set. |
| **Dealer** | Same SoW protocol as Instrument. |
| **Workflow** | `events()`: (1) emits an `RfqEvent` stream. `createRfq(req)`: (2) emits one `rfqId: number` then completes. Lifecycle invariant: (3) after `createRfq`, `events()` eventually emits a matching `Created` event with the same `rfqId`; (4) after a dealer `quote(...)`, `events()` emits a `Quoted` event; (5) after `accept(quoteId)`, `events()` emits an `Accepted` event referencing the same quote. |

Multi-subscriber invariants are **in scope** for ports where both impls already provide them today (ReferenceData, Blotter, Instrument, Dealer). They're descriptive of observable identity, not use-case behavior.

## Driver shapes (per port)

Each describer takes a `makeHarness: () => { port: <Port>; driver: <Port>Driver; teardown: () => void }`. The driver interface is port-specific. Simulator harnesses implement driver methods as no-ops (simulators self-emit); WsReal harnesses wire driver methods to `FakeWsAdapter.emit` or `FakeWsAdapter.nextRpcResponse`.

```ts
// ReferenceDataDriver
interface ReferenceDataDriver {
  snapshotPairs(): void;            // wsReal: emit one stream.referenceData frame
}

// PricingDriver
interface PricingDriver {
  tickPrice(symbol: string): void;                // wsReal: emit one stream.priceTick frame
  ackHistory(symbol: string, prices: PriceTick[]): void;  // wsReal: complete pending RPC
  ackRfqQuote(symbol: string, result: RfqQuoteResult): void;  // wsReal: complete pending RPC
}

// ExecutionDriver
interface ExecutionDriver {
  ackExecute(response: ExecutionResponseDto): void;  // wsReal: complete pending RPC
}

// BlotterDriver
interface BlotterDriver {
  emitTrades(trades: Trade[]): void;        // wsReal: emit one stream.blotter frame
}

// AnalyticsDriver
interface AnalyticsDriver {
  emitAnalytics(currency: string, update: PositionUpdates): void;
}

// InstrumentDriver
interface InstrumentDriver {
  startOfStateOfTheWorld(): void;
  addInstrument(inst: Instrument): void;
  removeInstrument(id: string): void;
  endOfStateOfTheWorld(): void;
}

// DealerDriver — same shape as InstrumentDriver with Dealer in place of Instrument

// WorkflowDriver
interface WorkflowDriver {
  ackCreateRfq(rfqId: number): void;
  ackCancelRfq(): void;
  ackQuote(): void;
  ackPass(): void;
  ackAccept(): void;
  emitCreated(rfqId: number, ...): void;       // emit one stream.workflowEvent
  emitQuoted(quoteId: number, ...): void;
  emitAccepted(quoteId: number, ...): void;
  // (Rejected/Timeout/Cancelled events are Phase 5C follow-up if needed)
}
```

## FakeWsAdapter design

```ts
// packages/client/src/app/adapters/__test__/FakeWsAdapter.ts
import type { IWsAdapter } from "../IWsAdapter";

export class FakeWsAdapter implements IWsAdapter {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();
  private sent: Array<{ type: string; payload?: unknown }> = [];
  private pendingRpcs: Array<{ type: string; resolve: (r: RpcResponse) => void }> = [];

  // ── IWsAdapter API ─────────────────────────────────────────
  on(type: string, handler: (payload: unknown) => void): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }
  send(type: string, payload?: unknown): void { this.sent.push({ type, payload }); }
  rpc(type: string, payload?: unknown): Promise<RpcResponse> {
    this.sent.push({ type, payload });
    return new Promise((resolve) => this.pendingRpcs.push({ type, resolve }));
  }
  close(): void { this.listeners.clear(); }

  // ── Test-only API ──────────────────────────────────────────
  /** Drive a fake server frame to all `on(type)` subscribers */
  emit(type: string, payload: unknown): void {
    this.listeners.get(type)?.forEach((h) => h(payload));
  }
  /** Resolve the next pending RPC of the given type with a response */
  nextRpcResponse(type: string, response: RpcResponse): void {
    const idx = this.pendingRpcs.findIndex((r) => r.type === type);
    if (idx < 0) throw new Error(`no pending RPC of type ${type}`);
    const [pending] = this.pendingRpcs.splice(idx, 1);
    pending!.resolve(response);
  }
  /** Inspect what the port sent over the wire */
  sentMessages(): readonly { type: string; payload?: unknown }[] { return this.sent; }
}
```

The `IWsAdapter` interface is extracted from the existing `WsAdapter` class so TS enforces signature parity between the real and fake.

## Wire fixtures

```ts
// packages/shared/src/__fixtures__/wireFrames.ts
import type { ReferenceDataMessage, PriceTickDto, BlotterMessage, /* ... */ } from "../index";

export const referenceDataFrame = (): ReferenceDataMessage => ({
  updates: [
    { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "GBPUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "USDJPY", ratePrecision: 3, pipsPosition: 2 },
    { symbol: "NZDUSD", ratePrecision: 5, pipsPosition: 4 },
    // ... canonical set matching what ReferenceDataSimulator emits
  ],
});

export const priceTickFrame = (symbol: string, opts?: Partial<PriceTickDto>): PriceTickDto => ({
  symbol,
  bid: 1.0998,
  ask: 1.1002,
  mid: 1.1000,
  valueDate: new Date().toISOString(),
  creationDate: new Date().toISOString(),
  ...opts,
});

// ... one factory per SERVER_MSG.* type
```

Typed against `@rtc/shared` DTOs. If a DTO shape changes, the fixture file fails to compile before any test runs.

## Error handling

The contract describers cover happy paths only. Simulators are deterministic and effectively never produce `subscriber.error(...)`; WsReal can on RPC `nack`. Encoding "trigger error" as a driver method would force every test through an awkward "simulator no-ops here" branch.

Error-path coverage is handled by three WsReal-only test files outside the contract:

- `wsRealExecution.errors.test.ts` — `executeTrade` nack ⇒ observable error
- `wsRealPricing.errors.test.ts` — `getPriceHistory` nack / empty payload ⇒ observable error
- `wsRealWorkflow.errors.test.ts` — `createRfq`, `cancelRfq`, `quote`, `pass`, `accept` nacks ⇒ observable errors

These are conventional unit tests, not contract tests; they live beside the WsReal contract test files and use the same `FakeWsAdapter`.

## Grep gate 23

Extend `tests/scripts/grep-gates.ts`:

```ts
{
  name: "23. Contract describers stay pure (no impl imports)",
  pattern: 'from "(\\.\\./)+simulators|from "@rtc/(client|shared/__fixtures__)',
  paths: ["packages/domain/src/ports/__contracts__/"],
  excludes: ["/node_modules/"],
},
```

This preserves the describers' role as the interface-level truth. A describer must receive a port via `makeHarness`; if it ever needs to import a fixture, that's a smell pointing toward a missing driver method.

The naming convention `*.contract.test.ts` is a soft norm. PR review enforces it.

## Integration with existing infrastructure

| Concern | Change |
|---|---|
| Vitest discovery | None. Each package's `vitest.config.ts` globs `src/**/*.test.ts`; new `*.contract.test.ts` files match naturally. |
| `pnpm test` (root) | None. Turborepo already fan-outs per-package tests. |
| `tests/scripts/run-all.ts` | None. Run-all orchestrates the 8 e2e peers; contract tests run under per-package vitest. |
| `@rtc/domain`'s `package.json` `exports` | Add `"./ports/__contracts__/*": "./dist/ports/__contracts__/*.js"` (and `.d.ts` typings entry). |
| `@rtc/shared`'s `package.json` `exports` | Add `"./__fixtures__/wireFrames": "./dist/__fixtures__/wireFrames.js"`. |
| `pnpm typecheck` | No change beyond exports updates. |
| `docs/architecture.md` §13 gate count | 22 → 23. |
| `docs/architecture.md` test stack table | Add a row or subsection documenting the contract test layer (1–2 paragraphs). |
| `docs/superpowers/STATUS.md` | Flip Phase 5C row to ✅ DONE on completion with SHA range. Add Phase 5C follow-ups section if needed. |

## Out of scope

| Item | Reason |
|---|---|
| `ConnectionEventsPort` contract test | No simulator counterpart; `BrowserConnectionEventsAdapter.test.ts` already covers it. |
| Real gateway-events adapter | Phase 5D. |
| Removing `withSyntheticGatewayConnected` | Phase 5D. |
| Server-side contract tests | Considered as a wire-drift mitigation; chose the shared-fixture approach instead. Can be added later as a follow-up if drift is observed. |
| Refactoring existing 6 simulator unit tests | Contract tests are additive; existing unit tests cover simulator-internal invariants (seed determinism, internal state) the contract doesn't. |
| React/presenter/UI-level tests | Already covered by Phases 5A.* and 5B.*. |
| Performance benchmarks | Different concern. |
| Replaying production wire traffic against simulators | Could be a future "fuzz contract" phase. |

## Risks

| Risk | Mitigation |
|---|---|
| FakeWsAdapter API drifts from real WsAdapter | Extract `IWsAdapter` TS interface; both implement it. TS catches method-signature divergence at compile time. |
| Wire fixtures drift from server protocol | Shared file in `@rtc/shared`, typed against existing DTOs. Server change to a DTO breaks fixture compile before any test runs. |
| Workflow contract under-specifies the RFQ lifecycle | 5C covers Created → Quoted → Accepted happy path. Rejected/Timeout/Cancelled lifecycle events become Phase 5C follow-ups if divergence surfaces. |
| `@rtc/domain/ports/__contracts__/*` becomes load-bearing public API | Documented here; small (8 files); changes infrequently; future renames coordinated via grep. |
| Per-port describer assertions converge on a single "shape" that both impls happen to share but real production wire traffic violates | Out-of-scope risk; the shared fixture file is the bridge to real wire shapes. Mitigated by keeping fixtures faithful to actual server output. |

## Open questions for plan-writing

1. **Separate `pnpm test:contract` script?** Decision deferred. Recommend folded into `pnpm test` unless CI segmentation surfaces a concrete need.
2. **`FakeWsAdapter` visibility — internal or exported?** Recommend internal (in `__test__/`) for now; promote to a package export only when a second consumer appears.
3. **`IWsAdapter` location — new file or extracted from `WsAdapter.ts`?** Cosmetic; plan-writing picks based on existing file size.
4. **Order of port implementation** — simplest first (ReferenceData, Analytics) to validate the pattern, or alphabetic? Plan-writing decides; the spec doesn't constrain ordering.

## Sizing

| Metric | Count |
|---|---|
| New files | ~29 (8 describers + 1 wire fixture + 1 FakeWsAdapter + 1 IWsAdapter + 16 per-impl tests + 3 WsReal-nack tests) |
| Modified files | ~4 (2× `package.json` exports, `architecture.md`, `STATUS.md`) |
| Estimated commits | ~12–15 (per the Phase 5B.1 baseline) |
| Phase analogue | Similar shape to Phase 5B.1 (foundation, mechanical, no UI work) |
| Estimated assertion count | ~40–50 contract assertions × 2 impls = 80–100 test invocations, plus ~12 WsReal-only nack assertions |

## Decision log (from brainstorming, 2026-05-18)

1. **WsReal harness**: Fake WebSocket (in-memory). Vitest-native, fast, no server boot. Drift risk mitigated by shared wire fixtures.
2. **Scope**: All 8 transport ports, additive to existing simulator unit tests.
3. **File layout**: Contracts in `packages/domain/src/ports/__contracts__/`, per-impl tests beside each impl in their own package. Each package's existing vitest produces coverage naturally.
4. **ConnectionEventsPort**: skipped. No simulator counterpart.
5. **Phase 5D coupling**: none. 5C is pure contract tests. 5D stays a separate phase that implements the real gateway-events adapter.
6. **Wire-drift mitigation**: shared `wireFrames.ts` fixture file in `@rtc/shared`.
7. **Pattern**: imperative scripted-server. Per-port describer takes `makeHarness()`; per-impl files provide tiny `PortDriver` implementations (no-op for simulator, frame-emitter for WsReal).
8. **Error handling**: contracts cover happy path only; 3 WsReal-only `*.errors.test.ts` files cover nack paths.
9. **Grep gates**: add gate 23 (describer purity). No naming-convention gate.
10. **Cross-package import**: extend `@rtc/domain` and `@rtc/shared` `exports` maps.

## Next step

After this spec is reviewed and committed, invoke `superpowers:writing-plans` to produce `docs/superpowers/plans/2026-05-18-phase-5c-port-contract-tests.md` with bite-sized tasks suitable for subagent-driven execution.
