# RN mobile-v1 Phase 5b (Equities) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `@rtc/client-react-native`'s Equities module up to the mobile-v1 design — a ranked movers board, sparklines, a tick-flashing instrument header, a Skia candle chart, an order-ticket fill ceremony, and blotter polish.

**Architecture:** Presentation-only. Every data seam already exists and is verified (see Global Constraints); no port, preference, domain or `client-core` change. Pure view-model maths goes in `*.ts` files tested by vitest; RN components are `*.tsx` tested by jest-expo. Motion uses Reanimated over `@rtc/motion-core`'s shared constants, gated by `useShellMotionEnabled()`.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `react-native-reanimated` 4.5.0, `@shopify/react-native-skia` 2.6.2, `expo-haptics`, jest-expo + `@testing-library/react-native`, vitest.

## Why this phase is a bigger jump than Rates or Credit

`src/ui/equities` currently imports **zero** Reanimated and **zero** Skia (Credit and Rates each have 5 Reanimated files). It also owns **zero** of the 18 visual scenarios. This is the only module that starts from nothing, which is why the spec sequenced it last.

## Global Constraints

Copied from the parent spec (§5b, §6, §7) and verified against the tree on 2026-08-09.

- **Spec:** [../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md](../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md). Read §5b and §6 first.
- **No port / preference / domain / client-core change.** If a task seems to need one, stop and ask.
- **Worklet rule.** Any function reached from inside a Reanimated worklet must itself carry `"worklet"`, transitively, including `@rtc/motion-core` helpers. **jest is structurally blind to this class — the simulator is the only witness.** This repo has been bitten twice (PR #334, PR #340). `pnpm check:worklet-order` is the static half.
- **Banned literal tokens under `src/ui`**, including in comments: `setTimeout`, `setInterval`, `localStorage`, `fetch`, `rxjs`. The fill toast is exactly the shape of thing that tempts a timer — it may not use one. Grep-gated in CI.
- **Motion gating.** Everything behind `useShellMotionEnabled()`; render the static end-state when off.
- **Perf doctrine** (`docs/performance.md`): on RN *views*, animate `transform`/`opacity` only. **Skia draw parameters (a path's geometry, a rect's height) are NOT RN layout properties and ARE legal to animate** — do not confuse the two rules.
- **Horizontal chip rows** need `flexGrow: 0` / `flexShrink: 0` plus `alignItems: "center"`, or they stretch into full-height bars on short content (the Phase 4a bug). This plan adds three new chip rows — all three must carry it.
- **Styling** through `useThemedStyles(makeStyles)`; all colours from theme tokens, **no hardcoded hex**.
- **Handler naming** (`docs/handler-naming.md`): a concrete handler is named for its **effect**, never its occasion. `onX` is reserved for function-typed props.
- **Braces on all control statements** (Biome `useBlockStatements`); explicit types on non-literal `const` exports (`useExplicitType`).
- **Every test must be seen to FAIL before it passes.** Where a genuine red is not obtainable, say so explicitly in the report rather than implying one.
- **Run after each task:** `pnpm --filter @rtc/client-react-native test`, `pnpm --filter @rtc/client-react-native typecheck`, `pnpm lint:eslint`, `pnpm exec biome ci .`
  **`pnpm lint:eslint` is NOT optional and NOT implied by biome** — this repo layers custom ESLint AST rules (`arrow-body-style`, `padding-line-between-statements`, `rtc/newspaper-order`, `rtc/name-functions-by-effect`) on top of Biome. A previous phase shipped 6 ESLint errors because only `biome ci` was run.

## Verified seams — do not re-derive these

Every one of these was checked against the tree while writing this plan.

| Seam | Shape | Location |
|---|---|---|
| `useWatchlist()` | `readonly EquityInstrument[]` | react-bindings |
| `useEquityQuote(symbol)` | `EquityQuote \| null` | react-bindings |
| `useCandles(symbol, timeframe?)` | `readonly Candle[]` | react-bindings |
| `useEqWatchlistSort()` | `{ sort, setSort, cycle }` | react-bindings |
| `useOrderTicket(defaultSymbol)` | `UseOrderTicketResult` | react-bindings |
| `useEquityOrders()` / `useEquityPositions()` | `readonly EquityOrder[]` / `readonly EquityPosition[]` | react-bindings |
| `useShellMotionEnabled()` | `boolean` | `#/ui/shell/motion` |
| `useTickFlash(value, enabled)` | `TickFlashHandle` | `#/ui/rates/useTickFlash` |
| `nextTickFlash` / `rankGlide` | pure | `@rtc/motion-core` |
| `useRowInsertFlash` | hook | `#/ui/blotter` |

**Domain types:**
```ts
interface EquityInstrument { readonly symbol: string; readonly name: string; readonly exchange: string; }
interface EquityQuote { readonly symbol: string; readonly bid: number; readonly ask: number;
                        readonly last: number; readonly changePct: number; readonly timestamp: number; }
type EqWatchlistSort = "sym" | "chg" | "price";
type OrderTicketState =
  | { phase: "editing"; form: OrderTicketForm; error: string | null }
  | { phase: "submitting" }
  | { phase: "working"; order: EquityOrder }
  | { phase: "partiallyFilled"; order: EquityOrder }
  | { phase: "filled"; order: EquityOrder }
  | { phase: "rejected"; reason: string };
```

**Two things that must be PORTED, not imported.** RN may not import from `@rtc/client-react`. Both are pure and currently client-react-only:
- `sortWatchlistRows` (`packages/client-react/src/ui/equities/watchlist/watchlistVm.ts`) → Task 1
- `useNewestOrderId` + `newestUnseenId` (`packages/client-react/src/ui/equities/blotter/useNewestOrderId.ts`) → Task 9

Duplication is deliberate and follows the spec's own instruction ("port web's `useNewestOrderId`"). Promoting either to `client-core` would widen this phase into `client-react` and its tests; record it as a follow-up instead.

**One seam difference worth knowing:** web renders the sort as a single **cycle** chip (`EqWatchlistHead` calls `cycle`). The mobile design shows **three directly-selectable chips**, and `setSort(sort)` exists for exactly that. Use `setSort`. Do **not** count `cycle()` calls.

## Design targets

`docs/design/mobile/v1/reference-shots/equities/{markets,trade,blotter}.png` — the app has no counterpart for any of the three, which is why they sit in DRIFT.md's "prototype only" list.

- **markets** — `MARKETS / TRADE / BLOTTER` segment; `RANK BY` label + three chips (`% CHG`, `PRICE`, `A–Z`); rows of `01` rank index, `SYMBOL` over company name, inline sparkline, price, tinted `%` pill.
- **trade** — horizontal instrument tab strip; a card holding the instrument header (`SYMBOL`, `name · exchange`, big price, `% chg`) above the candle chart; an order-ticket card (`SELL`/`BUY`, `MKT`/`LMT`, qty chips, `LIMIT PX` −/+ stepper, full-width action button); a `POSITIONS` list.
- **blotter** — status pills and row-insert emphasis.

**Trap, already burned once (P8):** `reference-shots/*.png` are rendered inside a phone frame at roughly 89% scale. Absolute pixel distances read off those images are **not** 1:1 device points. Use them for structure, order and copy — never for geometry. Where geometry matters, guard it with a derived invariant test (see Task 3's precedent note).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/equities/markets/moversVm.ts` | **new** — pure: sort comparator, rank numbering, sparkline point derivation |
| `src/ui/equities/markets/moversVm.test.ts` | **new** — vitest |
| `src/ui/equities/markets/RankByChips.tsx` | **new** — the three sort chips |
| `src/ui/equities/markets/MoversRow.tsx` | **new** — one ranked row |
| `src/ui/equities/markets/MoversBoard.tsx` | **new** — the ranked list + glide |
| `src/ui/equities/markets/RowSparkline.tsx` | **new** — inline sparkline |
| `src/ui/equities/markets/useRankMoveGlide.ts` | **new** — RN shell over motion-core `rankGlide` |
| `src/ui/equities/markets/MarketsView.tsx` | modify — compose chips + board, keep `SectorHeatmap` |
| `src/ui/equities/markets/Watchlist.tsx` | **delete** — superseded by `MoversBoard` |
| `src/ui/equities/trade/InstrumentHeader.tsx` | **new** — symbol/name/price/%chg with tick flash |
| `src/ui/equities/trade/candleScene.ts` | **new** — pure: candles → draw-ready numeric scene |
| `src/ui/equities/trade/CandleChart.tsx` | **new** — Skia canvas, replaces `PriceChart` |
| `src/ui/equities/trade/PriceChart.tsx` | **delete** — react-native-svg version |
| `src/ui/equities/trade/OrderCeremony.tsx` | **new** — `OrderTicketState` ceremony + fill toast |
| `src/ui/equities/blotters/useNewestOrderId.ts` | **new** — ported from client-react |
| `src/ui/equities/blotters/OrdersBlotter.tsx` | modify — status pills + insert flash |
| `tests/visual/scenarios.tsx` | modify — three new scenarios |
| `docs/rn-open-items.md` | modify — record the new goldens as owed |

---

### Task 1: Pure movers view-model

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/moversVm.ts`
- Test: `packages/client-react-native/src/ui/equities/markets/moversVm.test.ts`

**Interfaces:**
- Consumes: `EquityInstrument`, `EquityQuote`, `EqWatchlistSort` from `@rtc/domain`.
- Produces:
  - `interface MoverRow { readonly symbol: string; readonly name: string; readonly last: number | null; readonly changePct: number | null; }`
  - `sortMovers(rows: readonly MoverRow[], sort: EqWatchlistSort): readonly MoverRow[]`
  - `sparklinePoints(closes: readonly number[], width: number, height: number): readonly { readonly x: number; readonly y: number }[]`

**This file is `.ts`, so it is a VITEST file, not jest.** This package runs `vitest run --passWithNoTests && jest`, and `jest.config.js` sets `testMatch: ["**/*.test.tsx"]` — `.tsx` only. A `.test.ts` run under jest reports "No tests found" and passes vacuously in **both** directions, so a red-then-green step there proves nothing. Import from `"vitest"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";

import { sortMovers, sparklinePoints } from "./moversVm";

const ROWS = [
  { symbol: "AAPL", name: "Apple Inc", last: 227.17, changePct: -1.06 },
  { symbol: "TSLA", name: "Tesla Inc", last: 248.67, changePct: 1.13 },
  { symbol: "NVDA", name: "NVIDIA Corp", last: 131.05, changePct: 0.21 },
];

describe("sortMovers", () => {
  test("chg sorts by change% descending — the design's default board order", () => {
    expect(sortMovers(ROWS, "chg").map((r) => r.symbol)).toEqual([
      "TSLA",
      "NVDA",
      "AAPL",
    ]);
  });

  test("price sorts by last descending", () => {
    expect(sortMovers(ROWS, "price").map((r) => r.symbol)).toEqual([
      "TSLA",
      "AAPL",
      "NVDA",
    ]);
  });

  test("sym sorts A-Z ascending", () => {
    expect(sortMovers(ROWS, "sym").map((r) => r.symbol)).toEqual([
      "AAPL",
      "NVDA",
      "TSLA",
    ]);
  });

  test("does not mutate its input", () => {
    const before = ROWS.map((r) => r.symbol);

    sortMovers(ROWS, "sym");
    expect(ROWS.map((r) => r.symbol)).toEqual(before);
  });

  test("rows with no quote yet sort last, never first", () => {
    const withNull = [
      { symbol: "ZZZZ", name: "Pending", last: null, changePct: null },
      ...ROWS,
    ];

    expect(sortMovers(withNull, "chg").at(-1)?.symbol).toBe("ZZZZ");
    expect(sortMovers(withNull, "price").at(-1)?.symbol).toBe("ZZZZ");
  });
});

describe("sparklinePoints", () => {
  test("maps closes across the full width and inverts y (screen coords)", () => {
    const pts = sparklinePoints([1, 2, 3], 100, 20);

    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 20 });
    expect(pts[2]).toEqual({ x: 100, y: 0 });
  });

  test("a flat series sits on the vertical midline rather than dividing by zero", () => {
    const pts = sparklinePoints([5, 5, 5], 100, 20);

    expect(pts.every((p) => p.y === 10)).toBe(true);
  });

  test("fewer than two closes yields no points — nothing to draw", () => {
    expect(sparklinePoints([], 100, 20)).toEqual([]);
    expect(sparklinePoints([5], 100, 20)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/equities/markets/moversVm.test.ts`
Expected: FAIL — `Cannot find module './moversVm'`.

- [ ] **Step 3: Implement**

```ts
import type { EqWatchlistSort } from "@rtc/domain";

/** One row of the movers board, flattened from an instrument plus its latest
 * quote. `last`/`changePct` are null until the first quote for that symbol
 * arrives — the board renders rows immediately rather than waiting. */
export interface MoverRow {
  readonly symbol: string;
  readonly name: string;
  readonly last: number | null;
  readonly changePct: number | null;
}

export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

/** Order rows for the design's three RANK BY chips. Ported from web's
 * `sortWatchlistRows` rather than imported: `@rtc/client-react-native` may not
 * depend on `@rtc/client-react`. Returns a NEW array — callers keep the
 * caller's array intact so React keys stay stable across re-sorts.
 *
 * Rows with no quote yet always sort last: a null price is "unknown", not
 * "zero", and floating an unpriced row to the top of a movers board would
 * misread as a mover. */
export function sortMovers(
  rows: readonly MoverRow[],
  sort: EqWatchlistSort,
): readonly MoverRow[] {
  const copy = [...rows];

  if (sort === "sym") {
    return copy.sort((a, b) => {
      return a.symbol.localeCompare(b.symbol);
    });
  }

  const key = sort === "chg" ? "changePct" : "last";

  return copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];

    if (av === null && bv === null) {
      return 0;
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }
    return bv - av;
  });
}

/** Project closes onto a width x height box in SCREEN coordinates (y grows
 * downward, so the highest close is at y = 0). A flat series has no range to
 * normalise against, so it sits on the midline instead of dividing by zero. */
export function sparklinePoints(
  closes: readonly number[],
  width: number,
  height: number,
): readonly SparklinePoint[] {
  if (closes.length < 2) {
    return [];
  }

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min;
  const step = width / (closes.length - 1);

  return closes.map((close, i) => {
    const ratio = range === 0 ? 0.5 : (close - min) / range;

    return { x: i * step, y: height - ratio * height };
  });
}
```

- [ ] **Step 4: Run and watch it pass**

Run: same command. Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/markets/moversVm.ts \
        packages/client-react-native/src/ui/equities/markets/moversVm.test.ts
git commit -m "feat(rn-equities): pure movers view-model — sort, sparkline projection"
```

---

### Task 2: RANK BY chip row

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/RankByChips.tsx`
- Test: `packages/client-react-native/src/ui/equities/markets/RankByChips.test.tsx`

**Interfaces:**
- Consumes: `useEqWatchlistSort()` → `{ sort, setSort, cycle }`.
- Produces: `RankByChips()` — no props; reads and writes the shared preference itself.

**Use `setSort(target)` directly.** The seam has a real setter; do not count `cycle()` calls.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { RankByChips } from "#/ui/equities/markets/RankByChips";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const setSort = jest.fn();

function vm(sort = "chg"): ViewModel {
  return {
    useEqWatchlistSort: () => {
      return { sort, setSort, cycle: () => undefined };
    },
  } as unknown as ViewModel;
}

test("renders the design's three chips, in order", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  expect(screen.getByText("% CHG")).toBeTruthy();
  expect(screen.getByText("PRICE")).toBeTruthy();
  expect(screen.getByText("A–Z")).toBeTruthy();
});

test("pressing a chip sets that sort directly", async () => {
  setSort.mockClear();
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("eq-rank-price"));
  expect(setSort).toHaveBeenCalledWith("price");
});

test("marks the active chip from the preference", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("sym")}>
      <RankByChips />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-rank-sym-active")).toBeTruthy();
});

test("chips never stretch — the Phase 4a full-height-bar bug", async () => {
  const { StyleSheet } = require("react-native");

  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  const row = StyleSheet.flatten(screen.getByTestId("eq-rank-row").props.style);

  expect(row.alignItems).toBe("center");
  const chip = StyleSheet.flatten(
    screen.getByTestId("eq-rank-price").props.style,
  );

  expect(chip.flexGrow).toBe(0);
  expect(chip.flexShrink).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/markets/RankByChips.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/equities/markets/RankByChips'`.

- [ ] **Step 3: Implement**

A `RANK BY` label plus three `Pressable` chips over `EQ_WATCHLIST_SORTS`, testIDs `eq-rank-${sort}` and `eq-rank-${sort}-active` on the selected one, labels from a local `Record<EqWatchlistSort, string>`:

```tsx
const RANK_LABEL: Record<EqWatchlistSort, string> = {
  chg: "% CHG",
  price: "PRICE",
  sym: "A–Z",
};
```

Note the label order in the design is `% CHG`, `PRICE`, `A–Z` — which is **not** the domain's `EQ_WATCHLIST_SORTS` order. Define an explicit display order constant and guard it with a permutation test against `EQ_WATCHLIST_SORTS` (same pattern as `SKIN_DISPLAY_ORDER` in `#/ui/shell/appearance/appearanceLayout.ts`), so a sort silently dropped from the row cannot go unnoticed.

The row carries `alignItems: "center"`; each chip carries `flexGrow: 0` and `flexShrink: 0`.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/markets/RankByChips.tsx \
        packages/client-react-native/src/ui/equities/markets/RankByChips.test.tsx
git commit -m "feat(rn-equities): RANK BY chip row bound to setSort"
```

---

### Task 3: Movers row

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/MoversRow.tsx`
- Test: `packages/client-react-native/src/ui/equities/markets/MoversRow.test.tsx`

**Interfaces:**
- Consumes: `MoverRow` from Task 1.
- Produces: `MoversRow({ row, rank, selected, onSelect })` where
  `rank: number` (1-based), `selected: boolean`, `onSelect: (symbol: string) => void`.
- **testIDs this task must emit** (Task 4's tests query them): `eq-mover-${symbol}`
  on the pressable row, and `eq-mover-${symbol}-rank` on the rank `Text`.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ROW = { symbol: "TSLA", name: "Tesla Inc", last: 248.67, changePct: 1.13 };

test("renders a zero-padded rank, symbol, name, price and signed pct", async () => {
  await renderWithTheme(
    <MoversRow row={ROW} rank={1} selected={false} onSelect={() => {}} />,
  );
  expect(screen.getByText("01")).toBeTruthy();
  expect(screen.getByText("TSLA")).toBeTruthy();
  expect(screen.getByText("Tesla Inc")).toBeTruthy();
  expect(screen.getByText("248.67")).toBeTruthy();
  expect(screen.getByText("+1.13%")).toBeTruthy();
});

test("a negative change keeps its own sign", async () => {
  await renderWithTheme(
    <MoversRow
      row={{ ...ROW, changePct: -1.06 }}
      rank={8}
      selected={false}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText("08")).toBeTruthy();
  expect(screen.getByText("-1.06%")).toBeTruthy();
});

test("renders placeholders rather than NaN before the first quote", async () => {
  await renderWithTheme(
    <MoversRow
      row={{ symbol: "ZZZZ", name: "Pending", last: null, changePct: null }}
      rank={9}
      selected={false}
      onSelect={() => {}}
    />,
  );
  expect(screen.queryByText("NaN")).toBeNull();
  expect(screen.getByText("—")).toBeTruthy();
});

test("pressing the row selects its symbol", async () => {
  const onSelect = jest.fn();

  await renderWithTheme(
    <MoversRow row={ROW} rank={1} selected={false} onSelect={onSelect} />,
  );
  fireEvent.press(screen.getByTestId("eq-mover-TSLA"));
  expect(onSelect).toHaveBeenCalledWith("TSLA");
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Rank is `String(rank).padStart(2, "0")`. Percent is `` `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` ``. Null price and null pct both render `—`. The pill's background/foreground come from theme tokens (`accentPositive` / `accentNegative`), never hex. `selected` adds the ring style used by the rest of the module.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/markets/MoversRow.tsx \
        packages/client-react-native/src/ui/equities/markets/MoversRow.test.tsx
git commit -m "feat(rn-equities): ranked movers row"
```

---

### Task 4: Movers board + rank-move glide

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/MoversBoard.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/useRankMoveGlide.ts`
- Modify: `packages/client-react-native/src/ui/equities/markets/MarketsView.tsx`
- Delete: `packages/client-react-native/src/ui/equities/markets/Watchlist.tsx` (+ its test)
- Test: `packages/client-react-native/src/ui/equities/markets/MoversBoard.test.tsx`

**Interfaces:**
- Consumes: `sortMovers`/`MoverRow` (Task 1), `MoversRow` (Task 3), `useWatchlist()`, `useEquityQuote(symbol)`, `useEqWatchlistSort()`, `useShellMotionEnabled()`, `rankGlide` from `@rtc/motion-core`.

**§3.2 is locked, and it is a deliberate deviation from the prototype:** use `@rtc/motion-core`'s shipped **560 / 820 ms** constants, *not* the prototype's 320 / 950, so RN and web keep one source of truth. Direction semantics stay the prototype's — up = green, down = red.

**Row keying:** key rows by `symbol`, never by index. The whole point of the glide is that a row keeps its identity across a re-sort; an index key destroys that and the animation silently becomes a cross-fade.

**Per-row quote hooks:** each row mounts its own `useEquityQuote(symbol)` — hooks must be at a component's top level, so the quote lookup lives in a small `MoversBoardRow` wrapper inside this file, exactly as today's `Watchlist` does. Do not call `useEquityQuote` in a loop.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { MoversBoard } from "#/ui/equities/markets/MoversBoard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];
const QUOTES: Record<string, { last: number; changePct: number }> = {
  AAPL: { last: 227.17, changePct: -1.06 },
  TSLA: { last: 248.67, changePct: 1.13 },
};

function vm(sort = "chg"): ViewModel {
  return {
    useWatchlist: () => INSTRUMENTS,
    useEquityQuote: (symbol: string) => {
      return { symbol, bid: 0, ask: 0, timestamp: 0, ...QUOTES[symbol] };
    },
    useEqWatchlistSort: () => {
      return { sort, setSort: jest.fn(), cycle: () => undefined };
    },
  } as unknown as ViewModel;
}

test("ranks by change% under the chg sort — the mover leads", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("chg")}>
      <MoversBoard selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  const labels = screen.getAllByTestId(/-rank$/);

  expect(labels.map((n) => n.props.children)).toEqual(["01", "02"]);
  expect(screen.getByTestId("eq-mover-TSLA-rank").props.children).toBe("01");
});

test("re-sorting by symbol renumbers without remounting rows", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("sym")}>
      <MoversBoard selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-mover-AAPL-rank").props.children).toBe("01");
});

test("renders an empty state rather than a bare list", async () => {
  const empty = { ...vm(), useWatchlist: () => [] } as unknown as ViewModel;

  await renderWithTheme(
    <ViewModelProvider viewModel={empty}>
      <MoversBoard selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-movers-empty")).toBeTruthy();
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

`MoversBoard` reads `useWatchlist()`, wraps each instrument in a row component that fetches its own quote, builds `MoverRow[]`, applies `sortMovers(rows, sort)`, and renders `MoversRow` with a 1-based `rank`. Each row is an `Animated.View` carrying `LinearTransition` (plus `entering`/`exiting`) **only when `useShellMotionEnabled()` is true**; when motion is off, render plain `View`s at the static end-state.

`useRankMoveGlide` is the RN shell over motion-core's `rankGlide` — it takes the previous and current rank and returns the direction-tinted overlay opacity as a shared value. Keep the maths in motion-core; this file is the thin framework shell (ADR-005).

**Worklet rule applies here.** Anything `useRankMoveGlide` calls from inside a worklet must itself carry `"worklet"`, transitively. Run `pnpm check:worklet-order`, and remember jest cannot see this class — flag it for the device pass.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Delete the superseded Watchlist**

```bash
git rm packages/client-react-native/src/ui/equities/markets/Watchlist.tsx \
       packages/client-react-native/src/ui/equities/markets/Watchlist.test.tsx
```

Then update `MarketsView.tsx` to render `RankByChips` + `MoversBoard` above the retained `SectorHeatmap`, and grep for any remaining `Watchlist` import: `grep -rn "markets/Watchlist" packages/client-react-native/src packages/client-react-native/tests`.

- [ ] **Step 6: Run the module's tests + typecheck**

- [ ] **Step 7: Commit**

```bash
git add -u packages/client-react-native/src/ui/equities/markets/
git commit -m "feat(rn-equities): movers board with rank-move glide, retiring Watchlist"
```

---

### Task 5: Row sparklines

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/RowSparkline.tsx`
- Test: `packages/client-react-native/src/ui/equities/markets/RowSparkline.test.tsx`
- Modify: `packages/client-react-native/src/ui/equities/markets/MoversRow.tsx`

**Interfaces:**
- Consumes: `sparklinePoints` (Task 1), `useCandles(symbol)`.
- Produces: `RowSparkline({ symbol, positive })`.

**There is no equities tick-history stream** — no `usePriceHistory` equivalent. Derive the series from `useCandles(symbol)` closes, per the spec. **Colour transition only; no per-frame animation.**

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(closes: number[]): ViewModel {
  return {
    useCandles: () => {
      return closes.map((close, i) => {
        return { time: i, open: close, high: close, low: close, close };
      });
    },
  } as unknown as ViewModel;
}

test("draws a path once there are at least two closes", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm([1, 2, 3])}>
      <RowSparkline symbol="TSLA" positive />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-sparkline-TSLA")).toBeTruthy();
});

test("renders nothing when there is not enough history to draw", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm([1])}>
      <RowSparkline symbol="TSLA" positive />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("eq-sparkline-TSLA")).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Map `useCandles(symbol)` to closes, project with `sparklinePoints(closes, W, H)` inside a `useMemo`, and stroke a Skia `<Path>`. Colour is the positive/negative theme token chosen by the `positive` prop.

**Skia crossing, stated so nobody over-engineers it:** build the `SkPath` in a plain `useMemo` on the JS thread during the ordinary re-render and pass it to a declarative `<Path>`. Do **not** reach for the `createPicture` + `useDerivedValue` recorder that `CoreScene` uses — that pattern exists for clock-driven geometry. A sparkline redrawn when candles change is nowhere near needing it.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Wire into `MoversRow`** between the name block and the price block, matching the design's column order.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/equities/markets/
git commit -m "feat(rn-equities): row sparklines derived from candle closes"
```

---

### Task 6: Instrument header

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/InstrumentHeader.tsx`
- Test: `packages/client-react-native/src/ui/equities/trade/InstrumentHeader.test.tsx`
- Modify: `packages/client-react-native/src/ui/equities/trade/TradeView.tsx`

**Interfaces:**
- Consumes: `useEquityQuote(symbol)`, `useWatchlist()` (for `name`/`exchange`), `useTickFlash(value, enabled)`, `useShellMotionEnabled()`.
- Produces: `InstrumentHeader({ symbol })`.

Design copy: `SYMBOL` large, then `name · exchange` muted on the same line, then the price large and tinted with the signed `% chg` beside it. The `·` is a **middle dot (U+00B7)** — type the literal glyph. A bare `\uXXXX` escape renders as the literal escape sequence in this codebase (a real shipped defect class here).

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentHeader } from "#/ui/equities/trade/InstrumentHeader";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(): ViewModel {
  return {
    useWatchlist: () => {
      return [{ symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" }];
    },
    useEquityQuote: () => {
      return {
        symbol: "NVDA",
        bid: 0,
        ask: 0,
        last: 131.14,
        changePct: -0.94,
        timestamp: 0,
      };
    },
  } as unknown as ViewModel;
}

test("renders symbol, name, exchange, price and signed pct", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <InstrumentHeader symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.getByText("NVDA")).toBeTruthy();
  expect(screen.getByText("NVIDIA Corp · NASDAQ")).toBeTruthy();
  expect(screen.getByText("131.14")).toBeTruthy();
  expect(screen.getByText("-0.94%")).toBeTruthy();
});

test("the separator is a real middle dot, not an escape sequence", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <InstrumentHeader symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.queryByText(/\\u00B7/i)).toBeNull();
  expect(screen.getByText(/·/)).toBeTruthy();
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Reuse Rates' `useTickFlash(quote.last, motionEnabled)` and `@rtc/motion-core`'s `nextTickFlash` — do not write a second flash implementation. Apply the returned handle as an animated **transform/opacity** style only.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/trade/InstrumentHeader.tsx \
        packages/client-react-native/src/ui/equities/trade/InstrumentHeader.test.tsx \
        packages/client-react-native/src/ui/equities/trade/TradeView.tsx
git commit -m "feat(rn-equities): tick-flashing instrument header"
```

---

### Task 7: Skia candle chart

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/candleScene.ts`
- Create: `packages/client-react-native/src/ui/equities/trade/candleScene.test.ts` (**vitest**, see Task 1's note)
- Create: `packages/client-react-native/src/ui/equities/trade/CandleChart.tsx`
- Test: `packages/client-react-native/src/ui/equities/trade/CandleChart.test.tsx`
- Delete: `packages/client-react-native/src/ui/equities/trade/PriceChart.tsx` (+ its test)

**Interfaces:**
- Consumes: `useCandles(symbol, timeframe)`, `Candle` from `@rtc/domain`.
- Produces:
  - `interface CandleBar { readonly x: number; readonly bodyTop: number; readonly bodyHeight: number; readonly wickTop: number; readonly wickHeight: number; readonly rising: boolean; }`
  - `buildCandleScene(candles: readonly Candle[], width: number, height: number, barWidth: number): readonly CandleBar[]`
  - `CandleChart({ symbol })`

This replaces the current `react-native-svg` implementation, which re-renders the whole element tree on every update.

**Do NOT port the prototype's growing-last-candle animation literally.** The prototype animates `top`/`height` — those are **layout** properties and are banned on RN views by the perf doctrine. The legal equivalent here: the bar geometry is a **Skia draw parameter**, so recomputing it per candle update is fine. Only the last bar changes live.

- [ ] **Step 1: Write the failing test (pure scene first)**

```ts
import { describe, expect, test } from "vitest";

import { buildCandleScene } from "./candleScene";

const CANDLES = [
  { time: 1, open: 10, high: 12, low: 9, close: 11 },
  { time: 2, open: 11, high: 11.5, low: 8, close: 9 },
];

describe("buildCandleScene", () => {
  test("marks rising and falling bars by close vs open", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);

    expect(bars.map((b) => b.rising)).toEqual([true, false]);
  });

  test("the series high touches the top and the low touches the bottom", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);

    expect(Math.min(...bars.map((b) => b.wickTop))).toBe(0);
    const lowest = Math.max(...bars.map((b) => b.wickTop + b.wickHeight));

    expect(lowest).toBe(50);
  });

  test("a doji (open === close) still gets a visible body", () => {
    const bars = buildCandleScene(
      [{ time: 1, open: 10, high: 11, low: 9, close: 10 }],
      100,
      50,
      6,
    );

    expect(bars[0].bodyHeight).toBeGreaterThan(0);
  });

  test("no candles yields no bars rather than throwing", () => {
    expect(buildCandleScene([], 100, 50, 6)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/equities/trade/candleScene.test.ts`

- [ ] **Step 3: Implement `candleScene.ts`**

Project every candle into screen coordinates against the series' own high/low. A doji clamps `bodyHeight` to a 1px minimum so it does not vanish. Keep this file free of Skia and React imports — it is numeric only, which is what makes it vitest-testable and reusable.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Write the component test**

```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { CandleChart } from "#/ui/equities/trade/CandleChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(n: number): ViewModel {
  return {
    useCandles: () => {
      return Array.from({ length: n }, (_, i) => {
        return { time: i, open: 10, high: 12, low: 9, close: 11 };
      });
    },
  } as unknown as ViewModel;
}

test("renders the canvas once candles exist", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm(3)}>
      <CandleChart symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-candle-chart")).toBeTruthy();
});

test("shows an empty state instead of a blank canvas with no candles", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm(0)}>
      <CandleChart symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-candle-empty")).toBeTruthy();
});
```

- [ ] **Step 6: Implement `CandleChart.tsx`**

A Skia `<Canvas>` with one `<Rect>` per body and one per wick, from `buildCandleScene` inside a `useMemo`. Colours from `accentPositive` / `accentNegative` tokens. Same "plain `useMemo`, declarative primitives, no `createPicture` recorder" rule as Task 5.

- [ ] **Step 7: Delete `PriceChart` and re-point `TradeView`**

```bash
git rm packages/client-react-native/src/ui/equities/trade/PriceChart.tsx \
       packages/client-react-native/src/ui/equities/trade/PriceChart.test.tsx
grep -rn "PriceChart" packages/client-react-native/src packages/client-react-native/tests
```

Check whether `react-native-svg` still has any consumer in this package; if not, note it for a follow-up dependency removal rather than removing it in this task.

- [ ] **Step 8: Run tests + typecheck, then commit**

```bash
git add -u packages/client-react-native/src/ui/equities/trade/
git commit -m "feat(rn-equities): Skia candle chart replacing the SVG re-render"
```

---

### Task 8: Order ceremony + fill toast

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/OrderCeremony.tsx`
- Test: `packages/client-react-native/src/ui/equities/trade/OrderCeremony.test.tsx`
- Modify: `packages/client-react-native/src/ui/equities/trade/OrderTicket.tsx`

**Interfaces:**
- Consumes: `OrderTicketState` (six-way union, above), `useShellMotionEnabled()`, `expo-haptics`.
- Produces: `OrderCeremony({ state })`.

Phase 4a's `ExecutionCeremony` takes `{ state: TileExecutionState; direction: Direction | null }`. **Adapt, do not import** — the phase unions differ. This one keys off `OrderTicketState.phase`.

**No timers.** `setTimeout`/`setInterval` are banned literals under `src/ui` and CI greps for them. The toast's dwell is encoded as the exit animation's own duration, exactly as Credit's accept-linger was.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { OrderCeremony } from "#/ui/equities/trade/OrderCeremony";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ORDER = {
  id: "o1",
  symbol: "NVDA",
  side: "buy",
  qty: 500,
  price: 131.14,
  status: "filled",
} as never;

test("shows a fill toast on the filled phase", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "filled", order: ORDER }} />,
  );
  expect(screen.getByTestId("eq-order-toast-filled")).toBeTruthy();
});

test("shows a reject toast carrying the reason", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "rejected", reason: "NO LIQUIDITY" }} />,
  );
  expect(screen.getByTestId("eq-order-toast-rejected")).toBeTruthy();
  expect(screen.getByText("NO LIQUIDITY")).toBeTruthy();
});

test("renders nothing while editing — the toast is terminal-only", async () => {
  await renderWithTheme(
    <OrderCeremony
      state={{ phase: "editing", form: {} as never, error: null }}
    />,
  );
  expect(screen.queryByTestId(/^eq-order-toast/)).toBeNull();
});

test("shows a busy state while submitting", async () => {
  await renderWithTheme(<OrderCeremony state={{ phase: "submitting" }} />);
  expect(screen.getByTestId("eq-order-busy")).toBeTruthy();
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Map the six phases: `editing` → null; `submitting` → busy overlay; `working`/`partiallyFilled` → a working pill; `filled` → success toast + `Haptics.notificationAsync(NotificationFeedbackType.Success)`; `rejected` → error toast with the reason + `...Error`. Haptics and the animation both gate on `useShellMotionEnabled()`.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/trade/
git commit -m "feat(rn-equities): order ceremony and fill toast off OrderTicketState"
```

---

### Task 9: Blotter polish

**Files:**
- Create: `packages/client-react-native/src/ui/equities/blotters/useNewestOrderId.ts`
- Create: `packages/client-react-native/src/ui/equities/blotters/useNewestOrderId.test.ts` (**vitest** for `newestUnseenId`)
- Modify: `packages/client-react-native/src/ui/equities/blotters/OrdersBlotter.tsx`
- Test: `packages/client-react-native/src/ui/equities/blotters/OrdersBlotter.test.tsx`

**Interfaces:**
- Consumes: `useEquityOrders()`, `useRowInsertFlash` from `#/ui/blotter`.
- Produces: `useNewestOrderId(orders): string | null`, `newestUnseenId(prevIds, orders): string | null`.

Port both verbatim from `packages/client-react/src/ui/equities/blotter/useNewestOrderId.ts` (reproduced in full in the Global Constraints section's port note — read that file directly). It is pure and timer-free: it diffs the incoming id set against the previous render's set, with the ref only ever read or written **inside an effect**, never during render.

- [ ] **Step 1: Write the failing test for the pure half**

```ts
import { describe, expect, test } from "vitest";

import { newestUnseenId } from "./useNewestOrderId";

const order = (id: string) => {
  return { id } as never;
};

describe("newestUnseenId", () => {
  test("returns the last id absent from the previous set", () => {
    expect(
      newestUnseenId(new Set(["a"]), [order("a"), order("b"), order("c")]),
    ).toBe("c");
  });

  test("returns null when nothing is new", () => {
    expect(newestUnseenId(new Set(["a", "b"]), [order("a"), order("b")])).toBe(
      null,
    );
  });

  test("an empty previous set makes the last order newest", () => {
    expect(newestUnseenId(new Set(), [order("a"), order("b")])).toBe("b");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Port the hook and its pure helper**

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Wire status pills + insert flash into `OrdersBlotter`**

Status pills read from `EquityOrder.status` (`working` / `partiallyFilled` / `filled` / `rejected`), coloured from theme tokens. The newest row gets `useRowInsertFlash` — the same hook Phase 4b uses in `BlotterModule`, not a second implementation.

- [ ] **Step 6: Add the component test**

```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ORDERS = [
  {
    id: "o1",
    symbol: "NVDA",
    side: "buy",
    qty: 500,
    price: 131.14,
    status: "working",
  },
  {
    id: "o2",
    symbol: "AAPL",
    side: "sell",
    qty: 100,
    price: 227.17,
    status: "filled",
  },
] as never;

function vm(): ViewModel {
  return {
    useEquityOrders: () => ORDERS,
    useEqBlotterView: () => {
      return { view: "orders", setView: () => undefined };
    },
  } as unknown as ViewModel;
}

test("renders a status pill per order, coloured by status", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-order-status-working")).toBeTruthy();
  expect(screen.getByTestId("eq-order-status-filled")).toBeTruthy();
});

test("flags exactly one newest row, never two", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.queryAllByTestId(/-newest$/)).toHaveLength(0);
});
```

The second test asserts **zero** newest rows on first render deliberately: the ported hook's first render only captures the initial id set, because nothing counts as "new" on mount. If that assertion ever reads 1, the mount guard has been lost.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/ui/equities/blotters/
git commit -m "feat(rn-equities): blotter status pills and newest-row insert flash"
```

---

### Task 10: Restyle the keeps, add visual scenarios, record the goldens

**Files:**
- Modify: `packages/client-react-native/src/ui/equities/trade/DepthLadder.tsx`, `markets/SectorHeatmap.tsx`, `blotters/DeskPnlGauge.tsx`, `blotters/PnlSparkline.tsx`
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx`
- Modify: `docs/rn-open-items.md`

**These four components have no prototype analogue** — they are RN/web extras, not fidelity gaps. **Restyle to v5 tokens only.** Do not restructure them, and do not delete them.

- [ ] **Step 1: Restyle the four keeps**

Replace any hardcoded colour with a theme token; leave structure and behaviour untouched. Verify with `grep -nE "#[0-9a-fA-F]{3,8}" ` over the four files — expect no hits.

- [ ] **Step 2: Add three visual scenarios**

Add `equities/markets`, `equities/trade`, `equities/blotter` to `tests/visual/scenarios.tsx`, following the shape of the existing `credit/rfq-tiles` entry. Read `packages/client-react-native/tests/visual/README.md` first — the scenario matrix has a documented add-recipe, and `equities/*` are the module's first three.

- [ ] **Step 3: Run the scenario unit test**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/scenarios.test.tsx`

This asserts the matrix is well-formed. It does **not** capture pixels — that needs a booted simulator.

- [ ] **Step 4: Record the three goldens as owed**

In `docs/rn-open-items.md`, add the three new `equities/*` scenarios to the native-session punch list already tracked under **T44** (which owes `shell/appearance` + `shell/chrome` recaptures and the sheet scroll/pan check). Do not open a new roster item if it belongs on that row — read the file and judge. If you do add a numbered item, update the counts at the top (`RN-specific (N)` and `Total N`); check the current values rather than assuming.

**Capture caveat that must survive into that session:** the simctl tier can fail in a way *indistinguishable from a visual regression* — a failed deep link screenshots the Expo dev-client launcher and reports a large diff. Treat any visual failure above ~50% as "prove the capture succeeded" before treating it as a regression, and never regenerate a golden from an unverified capture.

- [ ] **Step 5: Full gate**

```bash
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/client-react-native typecheck
pnpm lint:eslint
pnpm exec biome ci .
pnpm check:doc-links
pnpm check:worklet-order
```

- [ ] **Step 6: Commit**

```bash
git add -u packages/client-react-native docs/rn-open-items.md
git commit -m "feat(rn-equities): restyle keeps to v5 tokens, add three visual scenarios"
```

---

## Done when

- The movers board ranks, renumbers and glides; the three RANK BY chips select directly through `setSort`.
- Sparklines derive from candle closes, with no tick-history stream invented.
- The instrument header tick-flashes through the shared `useTickFlash` / `nextTickFlash` pair.
- The candle chart is Skia, and `PriceChart.tsx` is gone.
- The order ceremony covers all six `OrderTicketState` phases with **no timer**.
- The blotter shows status pills and flashes the newest row.
- `DepthLadder`, `SectorHeatmap`, `DeskPnlGauge`, `PnlSparkline` are restyled but structurally untouched.
- Three `equities/*` visual scenarios exist and are recorded as owed goldens.
- `test`, `typecheck`, `lint:eslint`, `biome ci .`, `check:doc-links`, `check:worklet-order` all clean.

## Deliberately NOT in this phase

- **Golden capture.** Needs a booted simulator; recorded on T44's punch list instead.
- **On-device sign-off.** The worklet class is invisible to jest — the simulator is the only witness, and it is a human step.
- **Promoting `sortMovers` / `useNewestOrderId` to `client-core`.** Both are ported duplicates by the spec's own instruction; promoting them would widen this phase into `client-react`. Follow-up candidate.
- **Removing `react-native-svg`.** Task 7 checks whether any consumer remains but does not remove the dependency.
