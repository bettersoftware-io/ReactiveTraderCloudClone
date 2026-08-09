# Comparison Backfill Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a comparison is active, the near-left-edge trigger auto-loads older pages for the compare symbol too, so the compare line covers the same interval as the primary.

**Architecture:** `CandleChart`'s single near-edge effect stays the one gesture signal, but its gate becomes "fire while ANY participating series can still grow" (a new structural `compareBackfill` prop supplies the compare flags); `ChartPanel`'s handler (renamed `loadOlderForChart`) fires `loadOlderCandles` for the primary and, when set, the compare symbol — `CandleSeriesPresenter.loadOlder`'s per-key single-flight/exhaustion/cooldown makes ineligible calls safe no-ops. Chips stay driven by the primary's flags only.

**Tech Stack:** TypeScript, React 19 / SolidJS, vitest + @testing-library (contract tier).

**Spec:** `docs/superpowers/specs/2026-08-09-comparison-backfill-parity-design.md`

## Global Constraints

- `compareBackfill` is declared STRUCTURALLY everywhere (`{ readonly loadingOlder: boolean; readonly historyExhausted: boolean }`) — never import a bindings type into `ui-contract`; the bindings' `CandleBackfillState` satisfies it.
- Omitting `compareBackfill` (or having no `compare`) must leave behaviour byte-identical to today — `compareEligible` is false unless BOTH `compare` and `compareBackfill` are present.
- Chips (`LOADING OLDER…` / `START OF HISTORY`) remain driven by the PRIMARY's `loadingOlder`/`historyExhausted` only; the `historyStart` derivation is untouched.
- The prepend-watermark effect (`onShiftAnchors`) keeps reading the primary series only.
- Handler naming: the load handler's new name is `loadOlderForChart` in BOTH clients (states its effect on the chart's series set).
- Solid: the compare flags come from a keyed `createMemo` with a `const candleBackfillFor = useCandleBackfill;` alias — same biome `useHookAtTopLevel` false-positive class the adjacent `candleSeriesFor` alias documents; NO biome-ignore/eslint-disable anywhere (repo zero-disables policy). Do NOT add a `solid/reactivity` eslint-disable inside the memo (tracked scope — an unused directive breaks `check:lint-warnings-drift`).
- Repo rules: mandatory braces, explicit-block arrow bodies, blank-line padding, newspaper order, no inline styles, `#/` aliases.
- No new testids, no DOM changes, ZERO golden churn. No motion-core, server, bindings, or machine changes.
- Worktree: `.claude/worktrees/comparison-backfill` (branch `worktree-comparison-backfill`). Run `pnpm install && pnpm build` once before the first task (fresh worktree).
- Tasks 1 and 2 may run in parallel (disjoint packages: client-react vs client-solid); each stages ONLY its own package paths and runs per-package gates. Task 3 runs after both and additionally runs `pnpm exec biome ci .` + `pnpm lint:eslint` repo-wide (the net for anything the per-package runs missed).

---

### Task 1: React client — either-series gate + `loadOlderForChart`

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/CandleChart.tsx` (near-edge effect ~lines 111-125; props interface)
- Modify: `packages/client-react/src/ui/equities/chart/ChartPanel.tsx`

**Interfaces:**
- Consumes: existing `useCandleBackfill(symbol, timeframe)` and `loadOlderCandles(symbol, timeframe)` from the react ViewModel; `state.compare`.
- Produces: `CandleChartProps.compareBackfill?: { readonly loadingOlder: boolean; readonly historyExhausted: boolean }` — the exact name/shape Tasks 2 and 3 mirror.

- [ ] **Step 1: `CandleChart.tsx` — prop + gate**

Add to `CandleChartProps` (after `compare?`):

```ts
  /** The comparison symbol's backfill flags — powers the near-edge
   * trigger's either-series gate below. Silent paging: these flags never
   * drive the chips, which stay the primary's. Declared structurally (the
   * bindings' CandleBackfillState satisfies it) so ui-contract's props
   * mirror never needs a bindings import. Omitted ⇒ the compare series
   * never gates the trigger — exactly the pre-parity behaviour. */
  compareBackfill?: {
    readonly loadingOlder: boolean;
    readonly historyExhausted: boolean;
  };
```

Destructure `compareBackfill,` in the component signature (after `compare,` — no default). Replace the near-edge block (currently `const span … useEffect(…)` at ~111-125) with:

```ts
  // The near-edge fetch trigger — deliberately an EFFECT, the only one in
  // the chart shells: syncing view state (the viewport nearing the loaded
  // series' left edge) to an external data request is exactly what effects
  // are for (ADR-005), unlike the brush shells' gesture translation which
  // stays effect-free. One window of margin: fetch before the user can hit
  // the wall at normal pan speed, never fetch on an idle chart. With a
  // comparison active the ONE trigger pages BOTH series: the gate fires
  // while ANY participating series can still grow (either-series gate —
  // if the primary exhausts first, the compare keeps paging), and the
  // handler side fires both loads, relying on CandleSeriesPresenter's
  // per-(symbol|timeframe) single-flight/exhaustion/cooldown to no-op the
  // ineligible one.
  const span = viewport.end - viewport.start;
  const nearLeftEdge = viewport.start < span;
  const primaryEligible = !loadingOlder && !historyExhausted;
  const compareEligible =
    compare !== undefined &&
    compareBackfill !== undefined &&
    !compareBackfill.loadingOlder &&
    !compareBackfill.historyExhausted;

  useEffect(() => {
    if (nearLeftEdge && (primaryEligible || compareEligible)) {
      onLoadOlder();
    }
  }, [nearLeftEdge, primaryEligible, compareEligible, onLoadOlder]);
```

(The old comment block is replaced by the one above; nothing else in the file moves.)

- [ ] **Step 2: `ChartPanel.tsx` — flags + both-series handler**

After the existing `compareCandles` line add:

```ts
  // The comparison symbol's backfill flags — the presenter's "" key is a
  // pair of inert false-defaults, so no comparison costs nothing (mirrors
  // the compareCandles line above).
  const compareBackfill = useCandleBackfill(compare ?? "", timeframe);
```

Replace `loadOlderForSelected` with:

```ts
  // Pages every series the chart is rendering: the primary always, plus
  // the comparison when one is set. Ineligible series are safe no-ops in
  // CandleSeriesPresenter.loadOlder (single-flight, exhaustion latch,
  // error cooldown), so this needs no eligibility logic of its own — the
  // near-edge gate in CandleChart decides WHEN, this decides WHAT.
  function loadOlderForChart(): void {
    loadOlderCandles(sel, timeframe);

    if (compare !== null) {
      loadOlderCandles(compare, timeframe);
    }
  }
```

In the `<CandleChart>` JSX: `onLoadOlder={loadOlderForChart}` (replacing the old name), and after the `compare={…}` prop add:

```tsx
          compareBackfill={compare !== null ? compareBackfill : undefined}
```

- [ ] **Step 3: Verify (per-package)**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract`
Expected: all green — `ChartBackfill.contract.spec.ts` (mounts without `compareBackfill`) and `ChartCompare.contract.spec.ts` must pass unchanged. Also `pnpm exec biome check packages/client-react/src/ui/equities/chart/CandleChart.tsx packages/client-react/src/ui/equities/chart/ChartPanel.tsx` and `pnpm exec eslint` on the same two files.

- [ ] **Step 4: Commit**

```bash
git add packages/client-react
git commit -m "feat(client-react): comparison backfill parity — either-series near-edge gate, loadOlderForChart"
```

---

### Task 2: Solid client — twin

**Files:**
- Modify: `packages/client-solid/src/ui/equities/chart/CandleChart.tsx` (near-edge createEffect ~lines 104-112; props interface)
- Modify: `packages/client-solid/src/ui/equities/chart/ChartPanel.tsx` (ChartBody)

**Interfaces:**
- Consumes: Task 1's exact prop name/shape `compareBackfill?: { readonly loadingOlder: boolean; readonly historyExhausted: boolean }`; solid ViewModel's `useCandleBackfill`/`loadOlderCandles`; `state().compare`.
- Produces: solid parity for Task 3's shared spec.

- [ ] **Step 1: `CandleChart.tsx` (solid) — prop + gate**

Props gain the SAME `compareBackfill?` declaration + doc comment as Task 1 (verbatim, after `compare?`). Replace the near-edge `createEffect` body (currently reading `viewport`/`span`/`nearLeftEdge` and gating on `props.loadingOlder`/`props.historyExhausted`) with:

```ts
  createEffect(() => {
    const viewport = g.viewport();
    const span = viewport.end - viewport.start;
    const nearLeftEdge = viewport.start < span;
    const primaryEligible = !props.loadingOlder && !props.historyExhausted;
    const cb = props.compareBackfill;
    const compareEligible =
      props.compare !== undefined &&
      cb !== undefined &&
      !cb.loadingOlder &&
      !cb.historyExhausted;

    if (nearLeftEdge && (primaryEligible || compareEligible)) {
      props.onLoadOlder();
    }
  });
```

Carry the same extended comment block as Task 1's Step 1 above the effect (adapted from the file's existing comment — keep its solid-specific first sentence about "the only one in the chart shells besides the prepend watcher").

- [ ] **Step 2: `ChartPanel.tsx` (solid, inside `ChartBody`) — keyed flags memo + handler**

After the existing `compareCandles` memo add (note the alias — same rationale as `candleSeriesFor` directly above it):

```ts
  // Biome's useHookAtTopLevel is React-centric: solid-bindings' use*
  // functions are plain factories, and this alias keeps the keyed
  // createMemo call below from matching the hook-name heuristic under the
  // repo's no-disables policy (twin of candleSeriesFor above).
  const candleBackfillFor = useCandleBackfill;
  // The comparison symbol's backfill flags — same keyed-resource pattern
  // as compareCandles above (toSignal registers onCleanup; a memo re-run
  // disposes the previous subscription).
  const compareBackfill = createMemo(
    (): (() => {
      readonly loadingOlder: boolean;
      readonly historyExhausted: boolean;
    }) | null => {
      const sym = state().compare;
      return sym !== null ? candleBackfillFor(sym, props.timeframe) : null;
    },
  );
```

(`useCandleBackfill` must be in the `useViewModel()` destructure — add it if absent.) Rename `loadOlderForSelected` → `loadOlderForChart`:

```ts
  // Pages every series the chart is rendering: the primary always, plus
  // the comparison when one is set — ineligible series are safe no-ops in
  // CandleSeriesPresenter.loadOlder. Reads the compare symbol at CALL time
  // (event-handler scope), so no reactive wrapper is needed.
  function loadOlderForChart(): void {
    loadOlderCandles(props.symbol, props.timeframe);
    const sym = state().compare;

    if (sym !== null) {
      loadOlderCandles(sym, props.timeframe);
    }
  }
```

In the `<CandleChart>` JSX: `onLoadOlder={loadOlderForChart}`, and after `compare={…}`:

```tsx
          compareBackfill={
            compareBackfill() !== null ? compareBackfill()?.() : undefined
          }
```

- [ ] **Step 3: Verify (per-package)**

Run: `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid test:ui:contract`
Expected: all green. Also `pnpm exec biome check` + `pnpm exec eslint` on the two touched files, and `pnpm check:lint-warnings-drift` (the memo/alias area has bitten this gate before).

- [ ] **Step 4: Commit**

```bash
git add packages/client-solid
git commit -m "feat(client-solid): comparison backfill parity — Solid twin (keyed candleBackfillFor memo)"
```

---

### Task 3: Shared contract cases + props mirror + repo-wide lint net

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` (`CandleChartProps`)
- Modify: `packages/ui-contract/src/specs/equities/chart/ChartCompare.contract.spec.ts`

**Interfaces:**
- Consumes: Tasks 1/2's `compareBackfill` prop; the existing `mountPillWorkspace`/`mountChart` helpers and `COMPARE_CANDLES` fixture already in `ChartCompare.contract.spec.ts`; `ChartPanelPage.pressPlotKey`; the World's spy-able `candleHistory` method.
- Produces: nothing downstream — final task.

- [ ] **Step 1: props mirror**

In `CandleChartPage.ts`'s `CandleChartProps`, after `compare?`:

```ts
  /** The comparison symbol's backfill flags — the near-edge trigger's
   * either-series gate (silent paging; chips stay the primary's).
   * Structural on purpose: ui-contract never imports a bindings type. */
  compareBackfill?: {
    readonly loadingOlder: boolean;
    readonly historyExhausted: boolean;
  };
```

- [ ] **Step 2: Write the failing cases**

In `ChartCompare.contract.spec.ts`: add `vi` to the vitest import. Append a new describe (reusing the file's `CANDLES`, `COMPARE_CANDLES`, `DEFAULT_VISIBLE`, `LAST`, `mountPillWorkspace`; `mountChart` there takes only `{ compare }`, so this block gets its own small helper — placed with the other helpers at the bottom per newspaper order):

```ts
describe("Comparison backfill parity — the near-edge trigger pages both series", () => {
  it("primary exhausted but compare still growable: the trigger STILL fires (either-series gate)", () => {
    const onLoadOlder = vi.fn();
    const chart = mountCompareBackfillChart(onLoadOlder, {
      historyExhausted: true,
      compareBackfill: { loadingOlder: false, historyExhausted: false },
    });

    chart.pressPlotKey("Home");

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("both series exhausted: no fetch", () => {
    const onLoadOlder = vi.fn();
    const chart = mountCompareBackfillChart(onLoadOlder, {
      historyExhausted: true,
      compareBackfill: { loadingOlder: false, historyExhausted: true },
    });

    chart.pressPlotKey("Home");

    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it("compare paging is silent: an in-flight compare page never shows the LOADING OLDER chip", () => {
    const chart = mountCompareBackfillChart(vi.fn(), {
      compareBackfill: { loadingOlder: true, historyExhausted: false },
    });

    expect(chart.loadingOlderChip()).toBe(false);
  });

  it("without a comparison the trigger stays primary-gated", () => {
    const onLoadOlder = vi.fn();
    const chart = mountCompareBackfillChart(onLoadOlder, {
      historyExhausted: true,
      compare: undefined,
      compareBackfill: undefined,
    });

    chart.pressPlotKey("Home");

    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it("ChartPanel pages only the primary without a comparison, then BOTH symbols with one", async () => {
    const { head, panel, world } = mountPillWorkspace();
    const historySpy = vi.spyOn(world, "candleHistory");

    // Phase 1 — no comparison: the port sees ONLY the primary (no ""/
    // phantom fetches from the always-subscribed compare plumbing).
    panel.pressPlotKey("Home");

    const phase1 = historySpy.mock.calls.map((call) => {
      return call[0];
    });
    expect(new Set(phase1)).toEqual(new Set(["AAPL"]));

    // Phase 2 — comparison active: the same gesture pages both symbols.
    // (The fake port's empty page latched AAPL exhausted in phase 1, so
    // this ALSO exercises the either-series gate through the real stack:
    // primary ineligible, compare still growable ⇒ trigger fires.)
    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("percent");
    panel.pressPlotKey("Home");

    const phase2 = historySpy.mock.calls.map((call) => {
      return call[0];
    });
    expect(phase2).toContain("MSFT");
    expect(phase2).not.toContain("");
  });
});
```

Helper (bottom of file, with the others):

```ts
interface CompareBackfillMountOptions {
  historyExhausted?: boolean;
  compare?: { readonly series: readonly Candle[] };
  compareBackfill?: {
    readonly loadingOlder: boolean;
    readonly historyExhausted: boolean;
  };
}

/** mountChart's backfill-flavoured sibling: a compare overlay by default,
 * an onLoadOlder spy, and per-case primary/compare backfill flags — the
 * ChartBackfill.contract.spec.ts slot-spy pattern applied to the
 * either-series gate. Key-presence (not undefined) decides whether the
 * compare default applies, so `compare: undefined` genuinely mounts the
 * no-comparison arm (a destructuring default would silently re-apply on
 * explicit undefined). */
function mountCompareBackfillChart(
  onLoadOlder: () => void,
  opts: CompareBackfillMountOptions = {},
): CandleChartPage {
  const compare =
    "compare" in opts ? opts.compare : { series: COMPARE_CANDLES };

  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes: [],
      compare,
      compareBackfill: opts.compareBackfill,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: opts.historyExhausted ?? false,
      onLoadOlder,
    },
  });
}
```

- [ ] **Step 3: Run against both clients — expect the new cases to pass**

(Tasks 1/2 are already merged on the branch, so these pass immediately; the value is the pin plus cross-client parity.)

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract`
Expected: all green including 5 new cases ×2 clients. `ChartBackfill.contract.spec.ts` untouched and green.

- [ ] **Step 4: Repo-wide lint net (this task owns it)**

Run: `pnpm exec biome ci . && pnpm lint:eslint && pnpm check:lint-warnings-drift && pnpm --filter @rtc/ui-contract typecheck`
Expected: all clean — this is the net for anything Tasks 1/2's per-package runs missed. Fix any error that traces to THIS BRANCH's files (report anything else).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract
git commit -m "test(ui-contract): comparison backfill parity — either-series gate, silent chip, both-symbol paging"
```

---

## After all tasks (controller)

1. Final branch review (small diff — mid-tier model is fine), one fix wave max.
2. `/rtc:gauntlet full` from the worktree.
3. Rules 2–6: push, PR, CI loop, Rule-3 triage, `--merge`, cleanup. No golden work (zero visual change).
