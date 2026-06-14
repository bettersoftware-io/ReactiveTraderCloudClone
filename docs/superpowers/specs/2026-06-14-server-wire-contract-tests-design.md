# Server Wire-Protocol Contract Tests + Domain Value-Object Tests — Design

**Date:** 2026-06-14

**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Close the real *code* coverage gaps surfaced by the new coverage reports
(`@rtc/server` ~27%, `@rtc/domain` ~88%) by **adding behavioural tests** — with
the user's hard constraint that tests pin **behaviour / API contracts**, not
implementation details, so they survive refactors.

The headline deliverable is a **wire-protocol contract test for the server's
`wsHandler`** — the one leg of the client↔server↔domain contract triangle that
is not yet contract-pinned. A small secondary piece adds behavioural unit tests
for uncovered domain value-objects.

The `@rtc/client` **visual** gaps are explicitly **out of scope** here (deferred
follow-up): `src/ui` behaviour is already ~99% covered by the CI-gated contract
tier; the visual 54% is missing *appearance* (golden snapshots), a different kind
of gap with a different (dual-golden) cost.

## Background — the contract triangle

The repo already pins two of three protocol legs against the **same**
`@rtc/shared` wire shapes:

- **Client side** — `packages/client/src/app/adapters/wsReal*.contract.test.ts`
  (8 adapters) run the reusable `describe*PortContract` suites from
  `@rtc/domain/ports/__contracts__/`, proving each adapter turns canonical wire
  frames into the correct domain objects.
- **Domain side** — `packages/domain/src/simulators/*.contract.test.ts`
  (8 simulators) run the same port-contract suites, proving the simulators honour
  the ports.
- **Server side** — `packages/server/src/ws/wsHandler.ts` translates wire frames
  ↔ service calls, but has only a hand-written ~277-line test at ~30% coverage.
  **This is the missing leg.**

`@rtc/shared/__fixtures__/wireFrames.ts` provides canonical frame builders
(`priceTickFrame`, `executionResponseAck`, `rpcNack`, `tradeFrame`,
`workflowEventCreated`, `rpcAck`, …) and `packages/server/src/ws/protocol.ts`
defines the `CLIENT_MSG` / `SERVER_MSG` vocabulary. These are the single source
of truth the server contract test asserts against.

### Why Approach A (not B or C)

The client adapter contract tests assert at the **port layer** (domain-object
output); the wire frame is only a *fake stimulus* their harness `driver` injects.
The server's `wsHandler` is not a port — it has no `executeTrade(): Observable<Trade>`
to hand a port-contract suite; its contract lives at the **wire layer** (frame
shape). Because the two ends contract at different layers, a single shared suite
(Approach B) would force rewriting all 8 client drivers and dropping their
domain-semantic assertions — churn on green tests for no real gain. A round-trip
integration test (Approach C) overlaps the existing full-stack smokes and couples
two packages per test.

**Approach A** — assert the server's emitted frames against the shared
`@rtc/shared` shapes — gets B's cross-package guarantee for free (both ends lean
on the same fixture spine) while staying behavioural and self-contained in the
server package, leaving the 8 client tests untouched.

## Contract surface (the full `CLIENT_MSG → SERVER_MSG` matrix)

16 client message types. The current test covers the ones marked ✓; the suite
completes the rest.

**Subscriptions (7):**
- ✓ `subscribe.referenceData` → `stream.referenceData` (bulk SoW)
- ✓ `subscribe.pricing` → `stream.priceTick`
- `subscribe.blotter` → `stream.blotter` (bulk SoW)
- `subscribe.analytics` → `stream.analytics`
- ✓ `subscribe.instruments` → `stream.instrumentEvent` (start/end SoW markers)
- `subscribe.dealers` → `stream.dealerEvent` (start/end SoW markers)
- `subscribe.workflow` → `stream.workflowEvent`

**RPCs (7):**
- ✓ `rpc.executeTrade` → `rpc.executeTrade.response` (ack ✓ + nack ✓)
- `rpc.getPriceHistory` → `rpc.getPriceHistory.response`
- `rpc.createRfq` → `rpc.createRfq.response`
- `rpc.cancelRfq` → `rpc.cancelRfq.response`
- `rpc.quote` → `rpc.quote.response`
- `rpc.pass` → `rpc.pass.response`
- `rpc.accept` → `rpc.accept.response`

**Admin (2):**
- `admin.getThroughput` → `admin.getThroughput.response`
- `admin.setThroughput` → `admin.setThroughput.response`

**Protocol robustness (cross-cutting):** ✓ unknown type ignored, ✓ malformed JSON
ignored, ✓ subscription teardown on socket close. Keep and extend as needed.

## Piece 1 — `wsHandler` wire-protocol contract suite

**Location:** extend `packages/server/src/ws/wsHandler.test.ts`, reusing its
existing `FakeWs` (EventEmitter-based fake `ws` socket), `fakeServices(overrides)`,
and `connect(services)` helpers. No new fake-socket infrastructure. Reorganize
into per-family `describe` blocks (`subscriptions`, `rpc`, `admin`, `robustness`).

**For each subscription type, assert:**
1. **Routing** — the emitted frame(s) carry the correct `SERVER_MSG` type.
2. **Shape conformance** — the payload matches its `@rtc/shared` DTO / envelope
   shape (keys + types), via the shape helper below.
3. **SoW semantics** where applicable — bulk SoW (`stream.referenceData`,
   `stream.blotter`) carries the state-of-the-world marker on the first frame;
   marker-event streams (`stream.instrumentEvent`, `stream.dealerEvent`) are
   bracketed by start/end SoW markers.

**For each RPC type, assert:**
1. **Routing** — the matching `*.response` `SERVER_MSG` type is emitted.
2. **`correlationId` echo** — the response carries the request's `correlationId`.
3. **Ack shape** — the success payload conforms to the `@rtc/shared` shape.
4. **Nack path** — when the backing service errors (injected via `fakeServices`
   override returning `throwError`), a nack response is emitted (per the existing
   `rpcNack` shape) carrying the `correlationId`.

**For admin types, assert:** response type + payload shape (the throughput API
contract, pinned over WS).

**Shape-assertion helper (behaviour, not exact values):**

A small local helper in the test file:

```ts
// Asserts `frame` is the right protocol message and its payload has the SAME
// shape (keys + value types) as the canonical @rtc/shared fixture — NOT the
// same values (stream payloads are simulator-random). Pins the wire contract
// while staying refactor- and value-agnostic.
function expectFrameShape(frame: WsMessage, type: string, canonical: unknown): void
```

It checks `frame.type === type` and recursively compares the key set and
`typeof` of each field of `frame.payload` against `canonical` (the relevant
`wireFrames.ts` builder output). Arrays are checked element-shape against the
first canonical element. This keeps assertions tied to the shared fixture spine
without coupling to non-deterministic values or to handler internals.

**Behavioural guarantee:** the suite knows only frames-in → frames-out. Any
`wsHandler` refactor (routing table, operator pipeline, internal naming) leaves
it green as long as the wire contract holds; a wire-shape regression (or a
`@rtc/shared` shape change not mirrored on the server) turns it red.

## Piece 2 — domain value-object behavioural tests

Add co-located `*.test.ts` for the uncovered pure entities that carry real logic:

- `packages/domain/src/fx/currencyPair.ts`
- `packages/domain/src/analytics/position.ts`
- `packages/domain/src/credit/rfq.ts`
- `packages/domain/src/credit/creditTrade.ts`
- `packages/domain/src/credit/instrument.ts`
- `packages/domain/src/credit/dealer.ts`

Each is a pure input→output test of the module's exported functions (parse /
format / derive / construct), asserting observable results — no spying on
internals. During implementation, read each file first; if a file turns out to be
type-only (no runtime logic), skip it and note it (do not fabricate a test).

**Explicitly left alone:**
- `CreditRfqSimulator.ts` — already has `CreditRfqSimulator.contract.test.ts`; its
  uncovered branches are internal state-machine paths, and chasing them means
  testing internals. Out of scope.
- `ports/*.ts` and `ports/__contracts__/*.ts` — type-only interfaces / contract
  harnesses (the latter already executed by the simulator + adapter contract
  tests). Nothing to add.

## Coverage honesty (report-only, no gates)

Add an `exclude` to the `@rtc/server` coverage block in
`packages/server/vitest.config.ts`:

```ts
exclude: ["src/index.ts", "src/services/serviceContainer.ts"],
```

Rationale: both are side-effectful bootstrap / wiring. `serviceContainer.ts` is
pure `new X()` construction; `index.ts` binds a port on import. Neither is
unit-testable **without refactoring production code, which is off-limits**, and
both are already exercised by the full-stack smokes (`tests/fullstack/`).
Excluding them makes the server coverage number reflect the *testable contract
surface* rather than parking permanent, un-actionable red on un-unit-testable
bootstrap. Each exclusion carries a one-line reason comment (matching the visual
config's style). No threshold gate is added — the report stays report-only.

## Non-Goals

- **Visual scenarios / goldens** — deferred follow-up (different kind of gap;
  behaviour already contract-covered; dual-golden cost).
- **Approach B / C** — rejected above.
- **`index.ts` HTTP endpoint tests** — would require a forbidden production
  refactor to make the bootstrap testable; covered by full-stack smokes.
- **`serviceContainer` wiring tests** — implementation-detail; excluded.
- **`CreditRfqSimulator` internal-branch tests** — already contract-tested.
- **Any CI gate / threshold** on the new coverage — report-only.
- **No production `src/` edits** — tests and test-config only.

## Success Criteria

1. Every `CLIENT_MSG` type has a contract test asserting routing + `@rtc/shared`
   shape conformance; every RPC additionally asserts `correlationId` echo and the
   nack path.
2. The `wsHandler` contract suite reuses the existing `FakeWs`/`fakeServices`
   harness and asserts only at the frames-in/frames-out boundary (no internal
   spying).
3. Uncovered domain value-objects with real logic have behavioural input→output
   tests; type-only files are skipped with a note.
4. `packages/server/vitest.config.ts` coverage excludes `src/index.ts` and
   `src/services/serviceContainer.ts`, each with a reason comment; server
   coverage rises to reflect the testable contract surface.
5. `pnpm --filter @rtc/server test`, `pnpm --filter @rtc/domain test`, and both
   `test:coverage` runs pass; no production `src/` files changed; no CI gate added.
