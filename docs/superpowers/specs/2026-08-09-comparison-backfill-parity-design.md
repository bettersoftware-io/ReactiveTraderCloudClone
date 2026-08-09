# Comparison Backfill Parity — Design

**Date:** 2026-08-09
**Status:** Approved (design agreed in conversation 2026-08-09; user-reported UX defect)
**Follow-up to:** [comparison series](2026-08-08-comparison-series-design.md) — closes its §8
"compare-symbol backfill paging" deferral, which real usage proved wrong: the compare
line ends at its seed window while the primary auto-backfills, so panning left makes
the comparison silently vanish (the user did not notice the feature existed).

## 1. What this builds

While a comparison is active, panning toward the left edge auto-loads older pages
for the **compare symbol too**, so the violet line covers the same interval as the
primary. Silent paging: the LOADING OLDER… / START OF HISTORY chips stay driven by
the **primary only**. Both web clients.

## 2. Design (agreed)

**One trigger drives both series.** `CandleChart`'s existing near-left-edge effect
stays the single gesture signal; `ChartPanel`'s handler loads older pages for the
primary AND (when set) the compare symbol. `CandleSeriesPresenter.loadOlder` is
already keyed per `(symbol|timeframe)` with single-flight, exhaustion latching, and
error cooldown — calling it for an ineligible series is a safe no-op, so the handler
fires both unconditionally and lets the presenter arbitrate.

**Either-series gate.** Today the effect is gated on the primary's flags alone
(`!loadingOlder && !historyExhausted` — `CandleChart.tsx:122`), so if the primary
exhausts first the compare stops paging forever. The gate becomes "fire while ANY
participating series can still grow":

```
primaryEligible = !loadingOlder && !historyExhausted
compareEligible = compare present && compareBackfill present
                  && !compareBackfill.loadingOlder && !compareBackfill.historyExhausted
fire when nearLeftEdge && (primaryEligible || compareEligible)
```

**New plumbing (both clients):**
- `CandleChart` gains an optional prop
  `compareBackfill?: { readonly loadingOlder: boolean; readonly historyExhausted: boolean }`
  — declared STRUCTURALLY (inline interface in each client + the ui-contract
  props mirror), not imported: the bindings' `CandleBackfillState` satisfies it,
  but `ui-contract` depends on client-core only and must never import a bindings
  type (same reasoning as motion-core's `ChartCandle` structural subset).
  Omitted ⇒ `compareEligible` is false ⇒ behaviour is byte-identical to today.
- `ChartPanel` fetches `useCandleBackfill(compare ?? "", timeframe)` (react; the
  presenter's `""` key is inert defaults) / a keyed `createMemo` in Solid's
  `ChartBody` mirroring the existing `compareCandles` memo (`ChartPanel.tsx:101`),
  including the `candleBackfillFor = useCandleBackfill` alias — same biome
  `useHookAtTopLevel` false-positive class the `candleSeriesFor` alias already
  documents at `ChartPanel.tsx:92`; passes it as `compareBackfill` only while
  `compare !== null`.
- `ChartPanel`'s load handler (react `loadOlderForSelected`, solid twin) becomes
  "load older for every participating series": fires the primary always, plus
  `loadOlderCandles(compare, timeframe)` when compare is set, reading the compare
  symbol at call time. Rename to `loadOlderForChart` (name states the effect on
  the chart's series set, not just the selection).

**Unchanged, deliberately:**
- Chips: `loadingOlder`/`historyStart` remain the primary's flags only (silent
  compare paging). The `historyStart` derivation is untouched.
- The percent baseline, time-alignment, scale math — no motion-core change. The
  compare line aligns by time, so compare prepends extend it leftward for free
  and can never skew existing points (unlike the primary's index-anchored
  drawings; `onShiftAnchors` remains primary-prepend only, and compare prepends
  never fire it — the watermark effect reads the primary series alone).
- Server/wire: none. `candleHistory(symbol, …)` is already symbol-agnostic.
- No new bindings: `useCandleBackfill` + `loadOlderCandles` already exist in both.

## 3. Testing

- **Contract** (extend `ChartCompare.contract.spec.ts`, runs against both clients;
  the fake-port call-counting pattern comes from `ChartBackfill.contract.spec.ts`):
  1. With a comparison active, reaching the near-left edge requests an older page
     for BOTH symbols (port-level assertion per symbol).
  2. Primary exhausted, compare not ⇒ the trigger still fires and the compare
     keeps paging (the either-series gate's reason to exist).
  3. Compare paging never shows the LOADING OLDER… chip (primary idle, compare
     in-flight ⇒ no chip).
  4. No comparison ⇒ exactly today's single-symbol behaviour (no `""`/phantom
     fetches — assert the port saw only the primary symbol).
- **Existing suites**: `ChartBackfill.contract.spec.ts` must pass unchanged (its
  mounts omit `compareBackfill`).
- **Visual/e2e/motion-core**: none — no geometry change, no new DOM, no new
  testids; goldens untouched.

## 4. Out of scope

- Compare-side backfill chips or any compare-loading UI.
- Prefetching the compare's history on selection (only the near-edge gesture pages).
- RN (equities 5b unplanned), server changes, persistence.
