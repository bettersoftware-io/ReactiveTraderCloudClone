# Equities price history (M4) + closing the prototype ↔ data-model ledger

**Date:** 2026-09-28
**Status:** Approved 2026-09-28.
**Origin:** the Phase 5 design's
[§8.1 mismatch ledger](2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md#81-prototype--data-model-mismatches),
re-raised from another session as "six remaining mismatches — change the model
rather than keep bending the UI, without affecting the web app too much."

## 1. Outcome

Of the six items raised, **one** needs a data-model change. This spec builds
it (M4) and closes the other five in the docs, so the backlog stops presenting
settled questions as open work.

Success means:

- RN's equities movers sparkline draws a rolling window of **live last
  prices**, as the prototype does, instead of OHLC candle closes.
- No web client changes behaviour, and no web golden moves.
- `docs/STATUS.md` and `docs/rn-open-items.md` agree with the code about
  which mismatches are open.

## 2. Triage — why only one item is a model change

The list that prompted this work came from `docs/STATUS.md:29`, which still
lists all seven ledger rows as open. The code and `docs/rn-open-items.md` §1
had moved on. Each row was re-verified against `main` at `1d0f315c4`:

| # | Mismatch as raised | What the code says | Disposition |
|---|---|---|---|
| M1 | Sell-side has no history of submitted quotes | `RfqsPresenter` never evicts an RFQ, so settled RFQs remain in `rfqs`. `SellSidePanel` already renders a `YOUR QUOTES` section below the live tickets, with WON / LOST / PASSED derived from the real `QuoteState` (`SellSidePanel.tsx:62`, `quoteOutcome`). The ledger's premise — "history vanishes as RFQs close" — no longer holds. History is session-scoped, exactly as the web credit blotter is. | **Resolved** — no model change |
| M2 | `dealerIds` required, no dealer picker | Already **accepted 2026-08-05**: two clients populate it from a real picker; RN states "all dealers" explicitly at the call site. | Unchanged ruling |
| M3 | 120 s domain window vs 45 s prototype | `expirySecs` is a **per-RFQ** field (`CreateRfqInput.expirySecs?`, defaulted only when omitted in `CreateRfqUseCase`), honoured by `CreditRfqSimulator.scheduleExpiry` and the server's credit effect. The model can already express 45 s. **Decision 2026-09-28: keep 120 s everywhere** — fidelity to the reference implementation wins. | **Closed as a deliberate deviation.** Reopening it is a one-line client change (pass `expirySecs` from RN's `NewRfqForm`), never a model change. |
| M4 | Equities has no tick history; sparklines use candles | Confirmed. `MarketDataPort` offers `quotes`, `candles`, `candleHistory`, `depth` — no rolling price window. `MoversBoard` feeds `useCandles(symbol)` to `MoversRow` → `RowSparkline`. | **Build — this spec** |
| M5 | A fill carries no qty / price / outcome | `OrderTicketState`'s `working`, `partiallyFilled` and `filled` phases each carry the full `EquityOrder` (`qty`, `filledQty`, `avgPrice`). `OrderCeremony` renders the fill toast directly from `state.order` (`OrderCeremony.tsx:112`). | **Resolved** — no model change |
| M7 | Analytics history appends every 10 s, not 1 s | Already **closed 2026-08-05**: raising the cadence would shrink the P&L window from 15 min to 48 s to imitate a static demo's timer. | Unchanged ruling |

## 3. Design — M4

### 3.1 The shape: mirror FX exactly

FX sparklines are **not** seeded. `PriceHistoryUseCase` folds live
`getPriceUpdates` ticks into a window that starts empty.
`PricingPort.getPriceHistory` exists, but only Jarvis reads it (the
`get_price_history` tool and `jarvisPanels`); the sparkline presenter does not.
`PriceHistoryPresenter` owns one window per symbol so a remounted tile resumes
its accumulated line instead of blanking.

Equities adopts the same shape (decision 2026-09-28, chosen over a seeded
variant that would have added a port method, simulator support, a wire message
and a server effect, and left FX as the inconsistent one).

**Accepted consequence:** on a cold start a movers sparkline is empty, then
fills. The equities simulator ticks every 500 ms
(`EquityMarketDataSimulator.ts` `TICK_MS`), so a 25-point window is full in
about 12 s. This is the behaviour FX tiles already have on both web clients.

### 3.2 Domain — `@rtc/domain`

- **`EQUITY_PRICE_HISTORY_SIZE = 25`** in `equities/`. The value is the
  prototype's rolling window (`[...s.hist, px].slice(-25)`,
  `Reactive Trader Mobile.dc.html:2262`), cited in its doc comment.
- **`EquityPriceHistoryUseCase`**, a line-for-line mirror of
  `PriceHistoryUseCase`:

  ```ts
  execute(symbol: string, window: EquityQuote[] = []): Observable<readonly EquityQuote[]>
  ```

  Wrapped in `defer`; on each `marketData.quotes(symbol)` emission it pushes
  the quote, shifts once past `EQUITY_PRICE_HISTORY_SIZE`, and returns a copy.
  The `window` parameter lets a caller-owned array outlive a subscription;
  the cap applies whether or not one is supplied.
- Items are whole `EquityQuote` values, not bare numbers, so every point keeps
  its real `timestamp` — the same choice `PriceTick[]` makes for FX. The view
  reads `last`.
- Both are exported from the domain index. **`MarketDataPort` is not
  changed**, so no simulator, port contract, `@rtc/shared` DTO or server
  effect changes.

### 3.3 Contract — `@rtc/core-api`

```ts
/** Per-symbol rolling windows of live equity quotes backing the movers
 * sparklines. A remounted row re-reads its accumulated window rather than
 * restarting from an empty buffer. */
export interface EquityPriceHistoryPresenter {
  history$(symbol: string): Stream<readonly EquityQuote[]>;
}
```

`Presenters` gains `equityPriceHistory: EquityPriceHistoryPresenter`. The
application core grows from **74 to 75 members**.

### 3.4 The three cores

Each core implements the member natively, using **its own FX `priceHistory`
implementation as the template** — never by delegating to another core, and in
the two sibling cores never with an rxjs operator outside `bridge/`
(`bridge-owns-rxjs`, grep gate 43). The behaviour each must reproduce:

1. **One retained window per symbol**, owned by the presenter (a
   composition-root singleton), capped at `EQUITY_PRICE_HISTORY_SIZE`.
2. **Upstream released on last unsubscribe.** The per-symbol `quotes`
   subscription is ref-counted; retention holds the *array*, never the
   subscription (per-symbol streams must not be held for the session).
3. **Remount replays the window first.** A resubscriber to a symbol with a
   non-empty window receives it as its first value, before the next tick.
   A never-mounted symbol emits nothing until its first tick.
4. **Power-saver conflation** at the FX history's interval, as FX does.

Because each core's presenter map is typed exact against `Presenters`, adding
the member to `@rtc/core-api` fails all three typechecks until each core
implements it — the intended completeness witness.

**Contract suite.** A new `@rtc/core-contract` suite, registered in
`CONTRACT_SUITES` under `equityPriceHistory`, drives each core through a
scripted `MarketDataPort` and asserts: the cap (26 ticks → the newest 25, in
order); remount retention (unsubscribe, resubscribe, first value is the
retained window); upstream release (the scripted `quotes` subscription count
returns to zero after the last viewer leaves); and cold start (no emission
before the first tick). `portDiscipline`'s absolute construction-time counts
are re-checked — a lazily built per-symbol stream should add no
construction-time subscription.

### 3.5 RN client — the only consumer

- `MoversBoard` stops calling `useCandles(row.symbol)` for the sparkline and
  uses `useEquityPriceHistory(row.symbol)` instead. If candles have no other
  reader in that component, the call is removed rather than left unused.
- `MoversBoardRow` maps the history to its `last` prices, and `MoversRow` and
  `RowSparkline` take `prices: readonly number[]` in place of
  `candles: readonly Candle[]` — the leaf stays plain props (so
  compiler-memoizable) and no longer needs to know what a series is made of.
  The doc comments that say "there being no equities tick-history" are
  corrected.
- The hook `useEquityPriceHistory` is added to `@rtc/react-bindings`'
  `createViewModel`, next to `usePriceHistory`. Because `ViewModel` is a
  closed type, `client-react`'s two **test** fakes gain the member too; no
  web UI file changes. `@rtc/solid-bindings` is not changed (no consumer).
- All three clients' devtools presenter manifests gain
  `equityPriceHistory: { methods: ["history$"] }` —
  `check:manifest-drift` requires the web and RN manifests to match, so this
  one devtools line is the only web-app source change.
- The RN `markets` visual goldens are re-captured **once**, because the line
  genuinely changes shape. The visual harness feeds a fixed, literal window
  through the fake view model (never the live simulator), so the golden stays
  deterministic.

### 3.6 What does not change

- Any web UI component, and every web golden. The web clients receive the new
  member through the shared view-model construction but never call it; their
  only edits are the devtools manifest line and `client-react`'s two test
  fakes (§3.5).
- `@rtc/server`, `@rtc/shared`, the wire protocol, and `MarketDataPort`.
- The M2, M3 and M7 rulings.

## 4. Docs

- **`docs/rn-open-items.md` §1:** M1 and M5 marked resolved with the evidence
  in §2; M3 closed as a deliberate deviation with the 2026-09-28 decision and
  the per-RFQ `expirySecs` note; M4 pointing at this spec until it ships, then
  closed. Header date bumped.
- **`docs/STATUS.md:29`:** rewritten from "seven open" to the current state,
  and its duplicated trailing `Spec §8:` link removed (via the
  `tracking-workstream-status` skill).
- **Member count 74 → 75** wherever it is stated as a current fact:
  `CLAUDE.md` (Current Status, the two sibling-core package lines, the
  Application core rule), `docs/architecture/22-pluggable-application-core.md`,
  and ADR-006 where it states a present-tense count. Historical statements
  ("all 74 native as of slice 7") keep their number, with the new member
  noted after them.
- `pnpm check:manifest-drift` (the web ↔ RN presenter manifest) is updated if
  it lists `Presenters` members.

## 5. Testing

- **Domain:** `EquityPriceHistoryUseCase` — cap drops the oldest; a supplied
  window persists across two `execute` calls; the default gives a fresh window
  per call.
- **Contract:** the §3.4 suite, green on all three cores.
- **RN:** `RowSparkline` renders a polyline whose point count and ordering
  follow the supplied quotes; `MoversRow` passes history, not candles.
- **Mutation check** (`scripts/mutation-check.mjs`): at minimum, (a) the cap
  off by one, (b) the retained window not replayed on remount, (c) the
  upstream held after unsubscribe. Each must go red. A survivor is a gap in
  the tests, fixed before merge.
- **Timers:** any test that waits on a tick uses fake timers, per
  `docs/architecture/09-test-strategy.md` §"Waiting on time".
- Gates: `/rtc:gauntlet full` locally before the PR; CI green.

## 6. Delivery

One PR: the M4 build plus the §4 doc corrections. A reviewer could not
sensibly approve one while rejecting the other, since the docs describe the
state the build creates. The RN golden re-capture needs the iOS simulator and
is done in the same PR.

## 7. Out of scope

- Seeding either the FX or the equities window on a cold start.
- Retaining sell-side quote history across sessions (M1).
- Any change to the RFQ expiry default (M3).
- Using the new history in either web client.
