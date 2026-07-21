# RN mobile-v1 Rehaul — Phase 4b (Blotter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the React Native **Blotter** module (`packages/client-react-native`) to mobile-v1 prototype fidelity — a 4-column executed-trades table with status pills, a live row-insert flash, filter chips + a fills summary, and `Layout`-transition filter glides — over the unchanged `useViewModel()` data seam.

**Architecture:** Presentation-only rebuild, exactly like Phase 4a. Data flows through the existing `useTrades()` / `useNewTradeIds()` / `useRowHighlight()` / `useActivity()` hooks — unchanged. Row-insert and filter motion run as Reanimated 4 worklets on the UI thread; filter reordering uses Reanimated's native `LinearTransition` / `FadeInDown` / `FadeOut` (the platform-idiomatic FLIP — **not** motion-core `flipDeltas`, which targets the web's manual WAAPI path). All motion gated by `useShellMotionEnabled()`.

**Tech Stack:** Expo SDK 57 / RN 0.86, `react-native-reanimated@4.5.0`, `@rtc/domain` types. **No new dependencies.** Tests: `.test.ts` → vitest (pure fns), `.test.tsx` → jest-expo (components; reanimated globally mocked).

## Global Constraints

Every task's requirements implicitly include this section.

- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` / timers in `src/ui`. Data **only** through `useViewModel()` hooks. Type-only imports from `@rtc/domain` allowed.
- **Data seam is frozen:** no changes to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol.
- **⚠️ NEVER write `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` as a literal token anywhere in `src/ui` — INCLUDING COMMENTS.** The `@rtc/tests` gates are plain greps over the tree and match prose. Phase 4a reddened CI on a doc comment reading ``no `setTimeout` here``. Say "UI-side timers" instead.
- **Run `pnpm --filter @rtc/tests gates` before pushing.** It is ~1s, it is a CI gate, and a per-package gauntlet does **not** run it.
- **Perf doctrine:** animate **only `transform`/`opacity`** (plus the row-insert background flash, which is the one prototype-mandated colour animation — drive it via an animated style, never via layout props). Worklets on the UI thread. `Layout` transitions for list moves. Calm until a real event.
- **Motion gating:** every animation gated by `useShellMotionEnabled()` from `#/ui/shell/hud/useShellMotionEnabled`. When off, render the static end-state and cancel running worklets.
- **Styling:** use the existing memoizing helper **`useThemedStyles(makeStyles)`** (`#/ui/theme/useThemedStyles`) — NOT a bare `makeStyles(theme)` call per render. Blotter rows re-render on every trade; the memo matters, and there is no React Compiler in the RN package. All colours from theme tokens — **no hardcoded hex**.
- **Horizontal chip rows:** the filter `ScrollView` MUST set `style={{ flexGrow: 0, flexShrink: 0 }}` and `contentContainerStyle` `alignItems: "center"`. Without both, the chips stretch into full-height bars whenever the list is short (the Phase 4a filter-pill bug — do not reintroduce it).
- **Imports:** `#/` alias (maps to `src/`). No ≥2-up relative imports. No `@/`.
- **Exports:** named exports only outside `app/**` (Biome `noDefaultExport` is repo-wide; `app/**` is the Expo Router exception).
- **Braces on all control statements.** `rtc/component-newspaper` (exported component first, `*Props` + consts after), `useComponentExportOnlyModules`, `rtc/no-render-functions` (no inline `render*` closures — extract a named component).
- **Type-aware ESLint is a CI gate:** `await` every RNTL `render` / `renderWithTheme` / `fireEvent.press` (they return promises → `no-floating-promises`). Run BOTH `eslint .` and `eslint . --config eslint.config.typed.mjs`.
- **Biome `useExplicitType`** flags untyped file-scope `const` object literals in tests — type fixtures as `Trade` etc.
- **Animated styles:** an `AnimatedStyle<ViewStyle>` cannot be applied to `Animated.Text` (TextStyle mismatch) — wrap in an `Animated.View`.
- **Platform:** iOS-first, Android-safe.

## Prototype reference (source of truth)

`docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html` — BLOTTER markup L131–160, insert-flash L861–881, shared FLIP L772–850. Prototype-exact values:

| Element | Value |
|---|---|
| Filter chips | `ALL / DONE / PENDING / REJECTED`; mono `9.5px`/600, `letter-spacing 1px`, `padding 6px 11px`, `radius 999`; selected bg `accentPrimary` + `textOnAccent`, else transparent + `textSecondary` + `border` |
| Summary (right) | `{count} FILLS · {buys}B/{sells}S`, mono `9px`, `textMuted`; buys tinted `accentPositive`, sells `accentNegative` |
| Column header | 4-col `1.15fr 1fr 0.95fr 0.8fr`, `padding 5px 14px`, mono `8px`, `letter-spacing 1.5px`, `textMuted`, bottom border, bg `panelHead`. Labels: `PAIR · DIR` │ `NOTIONAL` │ `RATE` │ `STATUS` |
| Row | same 4-col grid, `padding 7px 14px 6px`, bottom border `borderSubtle` |
| Row col 1 | pair `11.5px`/600 `letter-spacing 0.4px` `textPrimary`; subline `{DIR} · #{id}` mono `8px` `letter-spacing 0.8px`, coloured BUY→`accentPositive` / SELL→`accentNegative` |
| Row col 2 | notional, mono `10.5px`, right-aligned, `textPrimary` |
| Row col 3 | rate, mono `10.5px`, right-aligned, `textSecondary` |
| Row col 4 | status **pill**: mono `8px`, `letter-spacing 0.8px`, `padding 2px 5px`, `radius 4`, text = status colour, border = same colour at ~45% alpha; **below it** the timestamp, mono `7.5px`, `textMuted`, `marginTop 2` |
| Status colours | `DONE → accentPositive`, `PENDING → accentAware`, `REJECTED → accentNegative` |
| Row-insert flash | **950ms**, `cubic-bezier(0.2,0.8,0.3,1)`: `translateY(-6px) → 0`, `opacity 0.4 → 1`, background `dirColour@30% → @18% (at 35%) → transparent` |
| Filter FLIP | stayers 320ms; enterers fade + rise `translateY(9px)→0` 300ms (60ms delay); leavers fade 220ms |

**Display formatting.** Prototype shows `EUR/USD` (the domain `Trade.currencyPair` is the bare symbol `"EURUSD"`) and the rate at pair precision (3 dp for JPY pairs, else 5).

**Timestamp — read this.** `Trade` carries only `tradeDate` (an ISO **date**, no time). The prototype's `HH:MM:SS` lives on the seam's **`useActivity(): readonly ActivityEntry[]`**, where `ActivityEntry = { trade: Trade; time: string /* HH:MM:SS */ }` — stamped when the presenter first observed the trade. So the module builds a `Map<tradeId, time>` from `useActivity()` and the row renders `time ?? trade.tradeDate`. Seeded/historic trades (never observed live) correctly fall back to the date.

## Data seam (verbatim — do not change)

```ts
// @rtc/react-bindings useViewModel()
useTrades: () => readonly Trade[];
useNewTradeIds: () => ReadonlySet<number>;
useActivity: () => readonly ActivityEntry[];
useRowHighlight: (isNew: boolean) => boolean;

// @rtc/domain
enum TradeStatus { Pending = "Pending", Done = "Done", Rejected = "Rejected" }
enum Direction { Buy = "Buy", Sell = "Sell" }
interface Trade {
  readonly tradeId: number; readonly tradeName: string;
  readonly currencyPair: string;   // bare symbol, e.g. "EURUSD"
  readonly notional: number; readonly dealtCurrency: string;
  readonly direction: Direction; readonly spotRate: number;
  readonly status: TradeStatus;
  readonly tradeDate: string; readonly valueDate: string;  // ISO dates
}

// @rtc/client-core
interface ActivityEntry { readonly trade: Trade; readonly time: string }
```

## File Structure

New module directory `packages/client-react-native/src/ui/blotter/`. The old flat `src/ui/{Blotter,TradeRow}.tsx` (+ their tests) are deleted in Task 7.

```
packages/client-react-native/src/ui/blotter/
  blotterFilter.ts          (T1) BLOTTER_FILTERS + filterTrades + summarize + formatPair + formatRate  [pure]
  BlotterFilterBar.tsx      (T2) chips + fills summary
  BlotterHeader.tsx         (T3) 4-col column header
  useRowInsertFlash.ts      (T4) Reanimated rise/fade/background flash
  TradeRow.tsx              (T5) rebuilt 4-col row + status pill + timestamp
  BlotterModule.tsx         (T6) filter state + animated list + empty state
app/(app)/blotter.tsx       (T6) renders <BlotterModule/>
```

---

### Task 1: Pure blotter helpers

**Files:** Create `src/ui/blotter/blotterFilter.ts`; Test `src/ui/blotter/blotterFilter.test.ts` (vitest).

**Interfaces produced:**
```ts
export const BLOTTER_FILTERS = ["ALL", "DONE", "PENDING", "REJECTED"] as const;
export type BlotterFilter = (typeof BLOTTER_FILTERS)[number];
export function filterTrades(trades: readonly Trade[], filter: BlotterFilter): readonly Trade[];
export interface BlotterSummary { readonly fills: number; readonly buys: number; readonly sells: number }
export function summarize(trades: readonly Trade[]): BlotterSummary;
export function formatPair(symbol: string): string;      // "EURUSD" -> "EUR/USD"
export function formatRate(spotRate: number, symbol: string): string;  // JPY pairs 3dp, else 5dp
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { BLOTTER_FILTERS, filterTrades, formatPair, formatRate, summarize } from "./blotterFilter";

function trade(id: number, status: TradeStatus, direction: Direction, currencyPair = "EURUSD"): Trade {
  return { tradeId: id, tradeName: `T${id}`, currencyPair, notional: 1_000_000, dealtCurrency: "EUR", direction, spotRate: 1.08723, status, tradeDate: "2026-07-20", valueDate: "2026-07-22" };
}

const trades = [
  trade(1, TradeStatus.Done, Direction.Buy),
  trade(2, TradeStatus.Rejected, Direction.Sell),
  trade(3, TradeStatus.Pending, Direction.Buy),
  trade(4, TradeStatus.Done, Direction.Sell),
];

describe("filterTrades", () => {
  it("passes everything through for ALL", () => {
    expect(filterTrades(trades, "ALL")).toHaveLength(4);
  });

  it("matches each status chip", () => {
    expect(filterTrades(trades, "DONE").map((t) => t.tradeId)).toEqual([1, 4]);
    expect(filterTrades(trades, "REJECTED").map((t) => t.tradeId)).toEqual([2]);
    expect(filterTrades(trades, "PENDING").map((t) => t.tradeId)).toEqual([3]);
  });

  it("exposes the prototype chip set in order", () => {
    expect(BLOTTER_FILTERS).toEqual(["ALL", "DONE", "PENDING", "REJECTED"]);
  });
});

describe("summarize", () => {
  it("counts fills and the buy/sell split", () => {
    expect(summarize(trades)).toEqual({ fills: 4, buys: 2, sells: 2 });
  });

  it("is zeroed for an empty blotter", () => {
    expect(summarize([])).toEqual({ fills: 0, buys: 0, sells: 0 });
  });
});

describe("formatting", () => {
  it("splits the symbol into base/terms", () => {
    expect(formatPair("EURUSD")).toBe("EUR/USD");
  });

  it("uses 3dp for JPY pairs and 5dp otherwise", () => {
    expect(formatRate(151.2405, "USDJPY")).toBe("151.240");
    expect(formatRate(1.087234, "EURUSD")).toBe("1.08723");
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/blotter/blotterFilter.test.ts`
Expected: FAIL — "Cannot find module './blotterFilter'".

- [ ] **Step 3: Implement**

`filterTrades`: `ALL` returns `trades`; otherwise keep trades whose `status.toUpperCase() === filter`. `summarize`: single pass counting `fills = trades.length`, `buys`/`sells` by `direction`. `formatPair`: `` `${symbol.slice(0, 3)}/${symbol.slice(3)}` ``. `formatRate`: `spotRate.toFixed(symbol.includes("JPY") ? 3 : 5)`. Braces on every control statement; no ≥2-up imports.

- [ ] **Step 4: Run it and confirm it PASSES** (8 assertions across 3 describes).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/blotter/blotterFilter.ts packages/client-react-native/src/ui/blotter/blotterFilter.test.ts
git commit -m "feat(rn-blotter): pure status filter, fills summary and display formatters"
```

---

### Task 2: Filter chips + fills summary

**Files:** Create `src/ui/blotter/BlotterFilterBar.tsx`; Test `BlotterFilterBar.test.tsx` (jest-expo).

**Interfaces:** Consumes `BLOTTER_FILTERS`/`BlotterFilter`/`BlotterSummary` (T1), `useThemedStyles`. Produces `BlotterFilterBar({ selected, onSelect, summary }: { selected: BlotterFilter; onSelect: (f: BlotterFilter) => void; summary: BlotterSummary })`.

**Behavior:** a horizontal chip row (`ALL/DONE/PENDING/REJECTED`) plus a right-aligned summary `{fills} FILLS · {buys}B/{sells}S` with the `B` count tinted `accentPositive` and the `S` count `accentNegative`.

> **Apply the Phase 4a chip fix:** `ScrollView` gets `style={{ flexGrow: 0, flexShrink: 0 }}`; its `contentContainerStyle` gets `alignItems: "center"`. Otherwise the chips stretch to full height when the list is short.

- [ ] **Step 1: Write the failing test** — assert all four chips render, `onSelect` fires with the tapped filter, and the summary text shows the counts. `await` the `renderWithTheme` and every `fireEvent.press` (verify `renderWithTheme`'s real export by reading `#/ui/theme/renderWithTheme` first).

```tsx
test("renders chips + summary and reports selection", async () => {
  const onSelect = jest.fn();
  await renderWithTheme(
    <BlotterFilterBar selected="ALL" onSelect={onSelect} summary={{ fills: 4, buys: 3, sells: 1 }} />,
  );
  expect(screen.getByText("REJECTED")).toBeTruthy();
  expect(screen.getByText(/4 FILLS/)).toBeTruthy();
  await fireEvent.press(screen.getByText("DONE"));
  expect(onSelect).toHaveBeenCalledWith("DONE");
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run: `pnpm --filter @rtc/client-react-native test BlotterFilterBar`
- [ ] **Step 3: Implement** to the prototype values in the reference table. Mirror `#/ui/rates/RateFilterBar.tsx` for the chip idiom, but use `useThemedStyles(makeStyles)`.
- [ ] **Step 4: Run it and confirm it PASSES**, then `pnpm exec biome check <both files>` and both eslint configs.
- [ ] **Step 5: Commit** — `feat(rn-blotter): filter chips + fills summary`

---

### Task 3: Column header

**Files:** Create `src/ui/blotter/BlotterHeader.tsx`; Test `BlotterHeader.test.tsx`.

**Interfaces:** Produces `BlotterHeader()` — no props. Renders the 4-column header (`PAIR · DIR` / `NOTIONAL` / `RATE` / `STATUS`) with the prototype's flex ratios `1.15 / 1 / 0.95 / 0.8`, mono 8px, letter-spacing 1.5, `textMuted`, `panelHead` background, bottom border.

> RN has no CSS grid — express the `1.15fr 1fr 0.95fr 0.8fr` ratios as `flex: 1.15` / `flex: 1` / `flex: 0.95` / `flex: 0.8` on four sibling `View`s. **Export these ratios as a shared const** (e.g. `export const BLOTTER_COLUMN_FLEX = { pair: 1.15, notional: 1, rate: 0.95, status: 0.8 } as const;`) and have `TradeRow` (T5) import them, so header and rows cannot drift out of alignment.

- [ ] **Step 1: Write the failing test** — assert all four labels render.
- [ ] **Step 2: Run it and confirm it FAILS.**
- [ ] **Step 3: Implement** (component first, then the ratio const + styles per `component-newspaper`).
- [ ] **Step 4: Run it and confirm it PASSES** + biome/eslint.
- [ ] **Step 5: Commit** — `feat(rn-blotter): 4-column header with shared column ratios`

---

### Task 4: Row-insert flash hook

**Files:** Create `src/ui/blotter/useRowInsertFlash.ts`; Test `useRowInsertFlash.test.tsx`.

**Interfaces:** Consumes reanimated + `useShellMotionEnabled`. Produces:
```ts
export function useRowInsertFlash(isNew: boolean, flashColor: string, enabled: boolean): { flashStyle: AnimatedStyle<ViewStyle> };
```

**Behavior (prototype L861–881):** when `isNew` becomes true AND `enabled`, play once over **950ms** with `Easing.bezier(0.2, 0.8, 0.3, 1)`: `translateY -6 → 0`, `opacity 0.4 → 1`, and `backgroundColor` from `flashColor` at ~30% alpha → ~18% at the 35% mark → transparent. When `enabled` is false, return the static end-state (`translateY 0`, `opacity 1`, transparent background) and cancel any running animation. Guard with a ref so the flash plays once per row, not on every re-render.

> Implementation notes: drive `translateY`/`opacity` from shared values. For the background, animate a `0 → 1` progress shared value and derive the colour inside `useAnimatedStyle` with reanimated's `interpolateColor` across the three stops — do **not** animate a layout property. Reanimated is globally jest-mocked, so the test asserts the hook mounts, survives `isNew` and `enabled` transitions, and returns a style — it cannot assert timing.

- [ ] **Step 1: Write the failing test** (mount a probe; rerender across `isNew` false→true and `enabled` true→false; assert no throw and a style is returned).
- [ ] **Step 2: Run it and confirm it FAILS.**
- [ ] **Step 3: Implement.** If `AnimatedStyle` is not exported by the installed reanimated, use `AnimatedStyle<ViewStyle>` from its `commonTypes` re-export (Phase 4a precedent) or `ReturnType<typeof useAnimatedStyle>`. Make typecheck pass.
- [ ] **Step 4: Run it and confirm it PASSES** + typecheck + biome + both eslint configs.
- [ ] **Step 5: Commit** — `feat(rn-blotter): row-insert flash hook (rise + fade + direction-tinted background)`

---

### Task 5: TradeRow rebuild

**Files:** Create `src/ui/blotter/TradeRow.tsx`; Test `src/ui/blotter/TradeRow.test.tsx`. (Do NOT touch the old flat `src/ui/TradeRow.tsx` — deleted in Task 7.)

**Interfaces:** Consumes `formatPair`/`formatRate` (T1), `BLOTTER_COLUMN_FLEX` (T3), `useRowInsertFlash` (T4), `useShellMotionEnabled`, `useThemedStyles`, `TradeStatus`/`Direction` (values) + `Trade` (type). Produces:
```ts
export function TradeRow({ trade, isNew, time }: { trade: Trade; isNew: boolean; time: string | undefined }): JSX.Element;
```

**Behavior:** the 4-column row from the reference table — col 1 `formatPair(trade.currencyPair)` + subline `{DIR} · #{tradeId}` coloured by direction; col 2 `trade.notional.toLocaleString("en-US")`; col 3 `formatRate(trade.spotRate, trade.currencyPair)`; col 4 a status **pill** (text + ~45%-alpha border in the status colour) with the timestamp `time ?? trade.tradeDate` beneath. Keep `testID={`trade-row-${trade.tradeId}`}` (existing e2e/page objects may rely on it — grep before changing). Wrap the row in an `Animated.View` carrying `useRowInsertFlash(isNew, directionColor, useShellMotionEnabled()).flashStyle`.

- [ ] **Step 1: Write the failing test** — assert: formatted pair `EUR/USD`; `#{id}` subline; formatted notional and rate; the status text; the timestamp uses `time` when given and falls back to `trade.tradeDate` when `undefined`; status colour differs between Done and Rejected (read the rendered style, mirroring the old `TradeRow.test.tsx` idiom — read it first).
- [ ] **Step 2: Run it and confirm it FAILS.**
- [ ] **Step 3: Implement.** No hardcoded hex — status/direction colours from theme tokens.
- [ ] **Step 4: Run it and confirm it PASSES** + typecheck + biome + both eslint configs.
- [ ] **Step 5: Commit** — `feat(rn-blotter): rebuild trade row (status pill, timestamp, insert flash)`

---

### Task 6: BlotterModule + route rewire

**Files:** Create `src/ui/blotter/BlotterModule.tsx`; Modify `app/(app)/blotter.tsx`; Test `BlotterModule.test.tsx`.

**Interfaces:** Consumes `useTrades`/`useNewTradeIds`/`useActivity` (via `useViewModel()`), T1–T5, `useShellMotionEnabled`, reanimated `Animated`/`LinearTransition`/`FadeInDown`/`FadeOut`. Produces named `BlotterModule()`.

**Behavior:**
- `const [filter, setFilter] = useState<BlotterFilter>("ALL")`; `const trades = useTrades()`; `const shown = filterTrades(trades, filter)`; `const summary = summarize(trades)` (summary reflects **all** trades, not the filtered subset — it is a blotter-wide total).
- Build `const timeById = new Map(useActivity().map((e) => [e.trade.tradeId, e.time]))` and pass `time={timeById.get(trade.tradeId)}` per row.
- `const newIds = useNewTradeIds()`; pass `isNew={newIds.has(trade.tradeId)}`.
- Render `<BlotterFilterBar>` + `<BlotterHeader>` + an `Animated.FlatList` (or a `FlatList` whose rows are `Animated.View`s) keyed by `tradeId`, with, when `useShellMotionEnabled()` is true: `itemLayoutAnimation={LinearTransition.duration(320)}` (or per-row `layout=`), `entering={FadeInDown.duration(300).delay(60)}`, `exiting={FadeOut.duration(220)}`; all `undefined` when motion is off.
- **Empty state:** the prototype has none — keep a themed empty message. Preserve the existing `testID="blotter-empty"` and its copy unless a grep shows nothing depends on it.

- [ ] **Step 1: Write the failing test** — mock `useViewModel` (`useTrades`/`useNewTradeIds`/`useActivity`) and `useShellMotionEnabled` (→ false, so layout props are `undefined` under jsdom). Assert rows render, tapping `DONE` filters to only Done trades, and the summary reflects **all** trades (not the filtered set). `await` presses.
- [ ] **Step 2: Run it and confirm it FAILS.**
- [ ] **Step 3: Implement** `BlotterModule` (named export).
- [ ] **Step 4: Rewire the route**

```tsx
// app/(app)/blotter.tsx
import type { JSX } from "react";

import { BlotterModule } from "#/ui/blotter/BlotterModule";

/** The Blotter module — executed-trades history. */
export default function BlotterScreen(): JSX.Element {
  return <BlotterModule />;
}
```

- [ ] **Step 5: Run test + typecheck.** The old flat `Blotter.tsx` is now unimported — `knip`/`lint:dead` will flag it. EXPECTED; it is deleted in Task 7. Note it in the commit body.
- [ ] **Step 6: Commit** — `feat(rn-blotter): module with filter chips, header, animated rows; route rewired`

---

### Task 7: Integration — delete legacy, full gauntlet

**Files:** Delete `src/ui/Blotter.tsx`, `src/ui/Blotter.test.tsx`, `src/ui/TradeRow.tsx`, `src/ui/TradeRow.test.tsx`.

- [ ] **Step 1: Delete the superseded flat files**

```bash
git rm packages/client-react-native/src/ui/Blotter.tsx packages/client-react-native/src/ui/Blotter.test.tsx \
       packages/client-react-native/src/ui/TradeRow.tsx packages/client-react-native/src/ui/TradeRow.test.tsx
```

- [ ] **Step 2: Grep for stale references** — `grep -rn "ui/Blotter\b\|ui/TradeRow\b" packages/client-react-native/{src,app}` must return ZERO (`ui/blotter/...` is the new module and is fine). Also grep the repo's e2e/page-object layer for `blotter-list` / `blotter-panel` / `blotter-empty` / `trade-row-` test IDs and keep any that are depended on.

- [ ] **Step 3: FULL gauntlet — all must pass**

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/tests gates            # ← the CI-only grep gates. DO NOT SKIP.
pnpm lint:dead                            # root knip
pnpm exec biome ci packages/client-react-native
pnpm exec eslint packages/client-react-native
pnpm exec eslint packages/client-react-native --config eslint.config.typed.mjs
```

- [ ] **Step 4: Commit** — `feat(rn-blotter): remove legacy flat Blotter UI; full gauntlet green`

---

### Task 8: On-device validation + pin goldens (the gate)

> Requires the **iOS simulator + user go/no-go**. Recipe: reuse the newest DerivedData `RTCMobile.app` (no native rebuild — this phase adds no dependencies), `simctl install`, start Metro from THIS worktree, deep-link, drive with `idb` (points = screenshot px ÷ 3).

- [ ] **Step 1: On-device checklist**
  - Dock → BLOTTER renders the 4-column table; header ratios line up with the rows.
  - Execute a trade in Rates → the new row **rises + fades + flashes** its direction colour at the top of the blotter.
  - Status pills: DONE green / PENDING amber / REJECTED red, with the softer border.
  - Timestamps show `HH:MM:SS` for live trades and fall back to the date for seeded ones.
  - Filter chips filter correctly, **stay compact when the list is short** (the Phase 4a stretch bug), and rows glide/fade on change.
  - Summary shows `{n} FILLS · {b}B/{s}S` and tracks new executions.
  - Empty state renders before any trade.
  - Reduced-motion: no flash/glide; content still correct.
  - Bottom inset: last row and the status strip clear the home indicator.

- [ ] **Step 2: Pin the `blotter` visual golden**, and — while the simulator is up — clear the two outstanding golden debts from earlier phases: the **`shell`** golden (Phase 3 residual) and the **`rates`** golden (Phase 4a residual). Follow the RN harness scenario recipe; use a frozen/seeded feed for determinism.

- [ ] **Step 3: Commit** — `test(rn-blotter): pin blotter/rates/shell visual goldens + on-device sign-off`

---

## Self-Review

- **Spec coverage** (master spec §5 Phase 4 "Blotter"): live row-insert flash ✓ (T4/T5); filter transitions — stayers glide / leavers fade / enterers rise ✓ (T6, native `Layout`); `FlatList` + `Layout`/`entering`/`exiting` ✓ (T6); module baseline pinned + on-device sign-off ✓ (T8).
- **Prototype coverage:** chips ✓, summary ✓, column header ✓, 4-col row + dir subline ✓, status pill + timestamp ✓, insert flash ✓. Prototype gaps handled explicitly: no empty state (we keep a themed one), and no time on `Trade` (joined from `useActivity`).
- **Type consistency:** `BlotterFilter` used identically in T1/T2/T6; `BLOTTER_COLUMN_FLEX` shared T3→T5 so header and rows cannot drift; `useRowInsertFlash(isNew, flashColor, enabled)` signature matches its T5 call site.
- **Phase 4a regressions pre-empted:** chip `flexGrow: 0` + `alignItems: center` (pill stretch); `useThemedStyles` (per-render styles); banned tokens never in prose (grep gate); `pnpm --filter @rtc/tests gates` in the gauntlet; `Animated.View` for `ViewStyle` animated styles.
- **No placeholders:** every step carries either complete code or exact prototype values plus a concrete pattern file to mirror.
