# Phase 8 — RN Equities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the web equities workspace to `@rtc/client-react-native` as a new **Equities** screen with three segmented sub-views (Markets / Trade / Blotters), and relocate Appearance off the bottom tab bar to a toolbar gear + overlay.

**Architecture:** Pure View phase. Every leaf reuses an already-bound ViewModel hook (`useWatchlist`, `useEquityQuote`, `useCandles`, `useDepth`, `useEquityOrders`, `useEquityPositions`, `useOrderTicket`) from `@rtc/react-bindings`; the native composition (`buildNativePorts` → `createSimulatorPorts`/`createWsRealPorts`) already supplies the equities ports, so nothing in composition changes. Web `<canvas>`/SVG becomes `react-native-svg`; geometry that jsdom cannot see is extracted into pure, unit-tested utils.

**Tech Stack:** React Native + Expo Router, `react-native-svg@15`, RxJS-backed ViewModel hooks, jest-expo (`.test.tsx`) + vitest (`.test.ts`).

## Global Constraints

- **Pure View + one shell change only.** No edits to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or web `@rtc/client-react`. No new runtime dependencies. The sole non-view change is relocating Appearance (Task 8).
- **`makeStyles` contract.** Styles come from a module-level `function makeStyles(t: RnTheme): XxxStyles` returning a **named interface** whose props are `ViewStyle`/`TextStyle`; consume via `const styles = useThemedStyles(makeStyles)`. No inline object *types* in params/returns (`no-restricted-syntax` bans `TSTypeLiteral`). Dynamic per-render values (`width: "NN%"`, `opacity`, a theme-derived `backgroundColor`) go in an **inline style array** `style={[styles.x, { ... }]}` — inline *style props* are lint-legal in client-react-native (the ban is scoped to client-react/client-prototype src only), exactly as `RfqCountdownBar` does.
- **Theme tokens** come from `RnTheme` (35 keys). Colour tokens designed for legibility: `textOnAccent` is legible **only on an accent fill** (accentPrimary/Positive/Negative/bgBrandPrimary) — never place it on a non-accent surface (the Phase 7 defect). Prefer `textPrimary`/`textSecondary`/`textMuted` on `panel`/`bgSecondary`.
- **No RN Modal for overlays.** Full-screen overlays are a plain absolute-fill `<View>` (Modal-via-press segfaults under x86 jest), following `LockScreen`.
- **Tests.** `.test.tsx` → jest-expo, import `{ expect, test }` from `@jest/globals`, render with `renderWithTheme` (+ `ViewModelProvider` + a partial fake `ViewModel` cast `as unknown as ViewModel` when the leaf reads hooks). `fireEvent.press`/`changeText` are async — `await` when the assertion checks a state-driven re-render, `void` when it checks a synchronously-invoked mock. `toHaveTextContent` needs `{ exact: false }` for substrings. `.test.ts` → vitest, import from `vitest`, must stay **react-native-free**.
- **Pure utils must stay react-native-free** (imported by vitest): `equityHeat.ts`, `buildCandles.ts`, `buildGauge.ts`, `buildSparkline.ts` import only from `@rtc/domain` (types).
- **Gauntlet is green only when the controller re-runs it first-hand:** `pnpm --filter @rtc/client-react-native typecheck`, `test` (vitest+jest), then repo-root `pnpm biome ci`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm knip`, `pnpm dlx syncpack@latest lint` (or the repo's syncpack script), and `pnpm --filter @rtc/client-react-native export` (bundle smoke). Typecheck+jest green ≠ CI-clean.

**Per-file test commands** (run from repo root):
- vitest single file: `pnpm --filter @rtc/client-react-native exec vitest run <path>`
- jest single file: `pnpm --filter @rtc/client-react-native exec jest <path>`

**Shared interface contract** (names/types used across tasks):

```
// equityHeat.ts
heat(changePct: number): number                       // min(1, abs(changePct)/10)
SECTOR_MAP: Readonly<Record<string,string>>; DEFAULT_SECTOR: string
interface SectorGroup { readonly sector: string; readonly instruments: readonly EquityInstrument[] }
groupBySector(instruments: readonly EquityInstrument[]): readonly SectorGroup[]

// buildCandles.ts
CANDLE_WIDTH = 300; CANDLE_HEIGHT = 160
interface CandleGeom { readonly x:number; readonly barW:number; readonly wickTop:number;
                       readonly wickBottom:number; readonly bodyY:number; readonly bodyH:number; readonly up:boolean }
buildCandles(candles: readonly Candle[], w?: number, h?: number): readonly CandleGeom[]

// buildGauge.ts
GAUGE_R=40; GAUGE_CX=52; GAUGE_CY=50; GAUGE_PAD=8
interface GaugePaths { readonly track:string; readonly fill:string|null; readonly needleX:number; readonly needleY:number }
buildGaugePaths(totalPnl:number, maxAbsPnl:number): GaugePaths

// buildSparkline.ts
SPARK_WIDTH=80; SPARK_HEIGHT=16; SPARK_PAD=2; SPARK_HALF_W = (80-2*2)/2
buildSparkPath(pnl:number, maxAbsPnl:number): string

// components (props)
Watchlist / SectorHeatmap / MarketsView / InstrumentTabs / TradeView : { selectedSymbol: string|null; onSelect: (symbol:string)=>void }
PriceChart / DepthLadder / OrderTicket : { symbol: string }
PnlSparkline : { pnl:number; maxAbsPnl?:number }
DeskPnlGauge : { positions: readonly EquityPosition[] }
OrdersBlotter / PositionsBlotter / BlottersView / EquitiesScreen : ()
EquitiesNav : { view: EquitiesView; onChange: (view:EquitiesView)=>void }   // EquitiesView = "markets"|"trade"|"blotters"
AppearanceButton : { onPress: ()=>void }
AppearanceOverlay : { open:boolean; onClose:()=>void }
```

Domain types (from `@rtc/domain`): `EquityInstrument{symbol,name,exchange}`, `EquityQuote{symbol,bid,ask,last,changePct,timestamp}`, `Candle{time,open,high,low,close}`, `DepthBook{symbol,bids,asks}` / `DepthLevel{price,size}`, `EquityOrder{id,symbol,side,type,qty,limitPrice?,status,filledQty,avgPrice?,createdAt}`, `EquityPosition{symbol,qty,avgPrice,markPrice,unrealisedPnl}`, `OrderSide="buy"|"sell"`, `OrderType="market"|"limit"`. `useOrderTicket(symbol)` returns `{ state: OrderTicketState } & OrderTicketIntents` where `OrderTicketState` is a discriminated union on `phase` ∈ `editing|submitting|working|partiallyFilled|filled|rejected` and intents are `setSide/setType/setQty/setLimitPrice/submit/reset` (`editing` carries `{ form:{symbol,side,type,qty,limitPrice?}, error:string|null }`; `working/partiallyFilled/filled` carry `order`; `rejected` carries `reason`).

---

### Task 1: Pure geometry utils

Four react-native-free utils that carry the geometry jsdom cannot see. Verbatim ports of the web math.

**Files:**
- Create: `packages/client-react-native/src/ui/equities/equityHeat.ts`
- Create: `packages/client-react-native/src/ui/equities/equityHeat.test.ts`
- Create: `packages/client-react-native/src/ui/equities/trade/buildCandles.ts`
- Create: `packages/client-react-native/src/ui/equities/trade/buildCandles.test.ts`
- Create: `packages/client-react-native/src/ui/equities/blotters/buildGauge.ts`
- Create: `packages/client-react-native/src/ui/equities/blotters/buildGauge.test.ts`
- Create: `packages/client-react-native/src/ui/equities/blotters/buildSparkline.ts`
- Create: `packages/client-react-native/src/ui/equities/blotters/buildSparkline.test.ts`

**Interfaces:**
- Produces: everything in the "Shared interface contract" block above for these four files.

- [ ] **Step 1: Write the failing tests**

`equityHeat.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { EquityInstrument } from "@rtc/domain";

import { DEFAULT_SECTOR, groupBySector, heat, SECTOR_MAP } from "#/ui/equities/equityHeat";

describe("heat", () => {
  it("is 0 for no change and 0.5 for a 5% move", () => {
    expect(heat(0)).toBe(0);
    expect(heat(5)).toBe(0.5);
    expect(heat(-5)).toBe(0.5);
  });
  it("clamps to 1 at or beyond a 10% move", () => {
    expect(heat(10)).toBe(1);
    expect(heat(-12.5)).toBe(1);
  });
});

describe("groupBySector", () => {
  const inst = (symbol: string): EquityInstrument => ({ symbol, name: symbol, exchange: "NASDAQ" });
  it("groups by SECTOR_MAP preserving first-seen order and falls back to DEFAULT_SECTOR", () => {
    const groups = groupBySector([inst("AAPL"), inst("JPM"), inst("ZZZ"), inst("MSFT")]);
    expect(groups.map((g) => g.sector)).toEqual(["Technology", "Finance", DEFAULT_SECTOR]);
    expect(groups[0].instruments.map((i) => i.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(groups[2].instruments.map((i) => i.symbol)).toEqual(["ZZZ"]);
    expect(SECTOR_MAP.AAPL).toBe("Technology");
  });
});
```

`buildCandles.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import { buildCandles, CANDLE_HEIGHT, CANDLE_WIDTH } from "#/ui/equities/trade/buildCandles";

const c = (open: number, high: number, low: number, close: number): Candle => ({ time: 0, open, high, low, close });

describe("buildCandles", () => {
  it("returns [] for no candles", () => {
    expect(buildCandles([])).toEqual([]);
  });
  it("maps a single up candle to full-height geometry", () => {
    // one candle, w=300 h=160, padX=2 padY=4: plotW=296 slotW=296 x=2+148=150
    // prices high=10 low=0 range=10; toY(10)=4, toY(0)=4+156=160; body open=2 close=8 up
    // bodyTop=toY(8)=4+(1-0.8)*152=4+30.4=34.4 bodyBot=toY(2)=4+(1-0.2)*152=4+121.6=125.6
    const [g] = buildCandles([c(2, 10, 0, 8)]);
    expect(g.x).toBeCloseTo(150, 5);
    expect(g.up).toBe(true);
    expect(g.wickTop).toBeCloseTo(4, 5);
    expect(g.wickBottom).toBeCloseTo(160, 5);
    expect(g.bodyY).toBeCloseTo(34.4, 5);
    expect(g.bodyH).toBeCloseTo(91.2, 5);
    expect(g.barW).toBeCloseTo(177.6, 5); // slotW*0.6 = 296*0.6
    expect(CANDLE_WIDTH).toBe(300);
    expect(CANDLE_HEIGHT).toBe(160);
  });
  it("marks a down candle and never returns a zero-height body", () => {
    const [down] = buildCandles([c(8, 9, 3, 4)]); // close(4) < open(8) => down
    expect(down.up).toBe(false);
    const [flat] = buildCandles([c(8, 8, 8, 8)]); // range collapses to 1, body clamps to >=1
    expect(flat.bodyH).toBeGreaterThanOrEqual(1);
  });
});
```

`buildGauge.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { buildGaugePaths, GAUGE_CX, GAUGE_CY, GAUGE_R } from "#/ui/equities/blotters/buildGauge";

describe("buildGaugePaths", () => {
  it("draws the lower-semicircle track from left to right", () => {
    const { track } = buildGaugePaths(0, 1);
    expect(track).toBe(`M${(GAUGE_CX - GAUGE_R).toFixed(1)},${GAUGE_CY.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 0 ${(GAUGE_CX + GAUGE_R).toFixed(1)},${GAUGE_CY.toFixed(1)}`);
  });
  it("returns a null fill at ~zero P&L and places the needle at bottom-centre", () => {
    const { fill, needleX, needleY } = buildGaugePaths(0, 1);
    expect(fill).toBeNull();
    expect(needleX).toBeCloseTo(GAUGE_CX, 5);
    expect(needleY).toBeCloseTo(GAUGE_CY + GAUGE_R, 5);
  });
  it("sweeps right for positive and left for negative P&L", () => {
    expect(buildGaugePaths(1, 1).fill).toContain(" 0 0 0 "); // fillSweep 0 (positive)
    expect(buildGaugePaths(-1, 1).fill).toContain(" 0 0 1 "); // fillSweep 1 (negative)
  });
});
```

`buildSparkline.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { buildSparkPath, SPARK_HALF_W } from "#/ui/equities/blotters/buildSparkline";

describe("buildSparkPath", () => {
  it("extends the bar rightward for positive P&L", () => {
    const cx = 2 + SPARK_HALF_W;
    expect(buildSparkPath(5, 10)).toBe(`M${cx},4 h${0.5 * SPARK_HALF_W} v8 h-${0.5 * SPARK_HALF_W} Z`);
  });
  it("extends the bar leftward for negative P&L and clamps at maxAbs", () => {
    const cx = 2 + SPARK_HALF_W;
    expect(buildSparkPath(-20, 10)).toBe(`M${cx},4 h-${SPARK_HALF_W} v8 h${SPARK_HALF_W} Z`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/equities/equityHeat.test.ts src/ui/equities/trade/buildCandles.test.ts src/ui/equities/blotters/buildGauge.test.ts src/ui/equities/blotters/buildSparkline.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the utils**

`equityHeat.ts`:
```ts
import type { EquityInstrument } from "@rtc/domain";

/** Normalised heat intensity for a percentage change: a 10% move = full heat.
 * Verbatim port of the web watchlist/heatmap `Math.min(1, abs(changePct)/10)`. */
export function heat(changePct: number): number {
  return Math.min(1, Math.abs(changePct) / 10);
}

/** Static sector classification used to group instruments visually (from web SectorHeatmap). */
export const SECTOR_MAP: Readonly<Record<string, string>> = {
  AAPL: "Technology",
  MSFT: "Technology",
  GOOGL: "Technology",
  META: "Technology",
  NVDA: "Technology",
  AMZN: "Consumer",
  TSLA: "Consumer",
  JPM: "Finance",
  BAC: "Finance",
  GS: "Finance",
  XOM: "Energy",
  CVX: "Energy",
};

export const DEFAULT_SECTOR = "Other";

export interface SectorGroup {
  readonly sector: string;
  readonly instruments: readonly EquityInstrument[];
}

/** Group instruments by `SECTOR_MAP`, preserving first-seen sector order. */
export function groupBySector(instruments: readonly EquityInstrument[]): readonly SectorGroup[] {
  const bySector = new Map<string, EquityInstrument[]>();
  for (const inst of instruments) {
    const sector = SECTOR_MAP[inst.symbol] ?? DEFAULT_SECTOR;
    const group = bySector.get(sector) ?? [];
    group.push(inst);
    bySector.set(sector, group);
  }
  return [...bySector.entries()].map(([sector, insts]) => {
    return { sector, instruments: insts };
  });
}
```

`trade/buildCandles.ts`:
```ts
import type { Candle } from "@rtc/domain";

export const CANDLE_WIDTH = 300;
export const CANDLE_HEIGHT = 160;
const PAD_X = 2;
const PAD_Y = 4;

export interface CandleGeom {
  readonly x: number;
  readonly barW: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly bodyY: number;
  readonly bodyH: number;
  readonly up: boolean;
}

/** Candlestick geometry for SVG. Verbatim port of the web canvas `drawCandles`
 * math (same padding, slot width, 0.6 body ratio, min/max scaling), returning
 * per-candle geometry instead of drawing — the SVG leaf renders it. */
export function buildCandles(
  candles: readonly Candle[],
  w: number = CANDLE_WIDTH,
  h: number = CANDLE_HEIGHT,
): readonly CandleGeom[] {
  if (candles.length === 0) return [];

  const allPrices = candles.flatMap((c) => {
    return [c.high, c.low];
  });
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;

  const plotW = w - PAD_X * 2;
  const plotH = h - PAD_Y * 2;
  const slotW = plotW / candles.length;
  const barW = Math.max(1, slotW * 0.6);

  function toY(price: number): number {
    return PAD_Y + (1 - (price - min) / range) * plotH;
  }

  return candles.map((c, i) => {
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    return {
      x: PAD_X + i * slotW + slotW / 2,
      barW,
      wickTop: toY(c.high),
      wickBottom: toY(c.low),
      bodyY: bodyTop,
      bodyH: Math.max(1, bodyBot - bodyTop),
      up: c.close >= c.open,
    };
  });
}
```

`blotters/buildGauge.ts`:
```ts
export const GAUGE_R = 40;
export const GAUGE_CX = 52;
export const GAUGE_CY = 50;
export const GAUGE_PAD = 8;

export interface GaugePaths {
  readonly track: string;
  readonly fill: string | null;
  readonly needleX: number;
  readonly needleY: number;
}

function arcPt(a: number): [number, number] {
  return [GAUGE_CX + GAUGE_R * Math.cos(a), GAUGE_CY + GAUGE_R * Math.sin(a)];
}

/** SVG paths for the lower-arc desk-P&L speedometer. Verbatim port of web
 * `buildGaugePaths`: θ=π left (max negative), θ=π/2 bottom (zero), θ=0 right
 * (max positive); angle = (π/2)(1−fraction); fill null when |fraction|<0.001. */
export function buildGaugePaths(totalPnl: number, maxAbsPnl: number): GaugePaths {
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.max(-1, Math.min(1, totalPnl / safe));
  const angle = (Math.PI / 2) * (1 - fraction);

  const [x0, y0] = arcPt(Math.PI);
  const [x1, y1] = arcPt(0);
  const track = `M${x0.toFixed(1)},${y0.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 0 ${x1.toFixed(1)},${y1.toFixed(1)}`;

  const [nx, ny] = arcPt(angle);
  if (Math.abs(fraction) < 0.001) {
    return { track, fill: null, needleX: nx, needleY: ny };
  }

  const [xFs, yFs] = arcPt(Math.PI / 2);
  const [xFe, yFe] = arcPt(angle);
  const fillSweep = fraction >= 0 ? 0 : 1;
  const fill = `M${xFs.toFixed(1)},${yFs.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 ${fillSweep} ${xFe.toFixed(1)},${yFe.toFixed(1)}`;

  return { track, fill, needleX: nx, needleY: ny };
}
```

`blotters/buildSparkline.ts`:
```ts
export const SPARK_WIDTH = 80;
export const SPARK_HEIGHT = 16;
export const SPARK_PAD = 2;
export const SPARK_HALF_W = (SPARK_WIDTH - SPARK_PAD * 2) / 2;
const CENTER_Y = SPARK_HEIGHT / 2;

/** SVG bar-path for a single P&L value centred on a zero line. Verbatim port of
 * web `buildSparkPath`: positive extends right, negative left; scaled by maxAbsPnl. */
export function buildSparkPath(pnl: number, maxAbsPnl: number): string {
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.min(1, Math.abs(pnl) / safe);
  const barLen = fraction * SPARK_HALF_W;
  const cx = SPARK_PAD + SPARK_HALF_W;
  const barTop = CENTER_Y - 4;
  const barH = 8;
  if (pnl >= 0) {
    return `M${cx},${barTop} h${barLen} v${barH} h-${barLen} Z`;
  }
  return `M${cx},${barTop} h-${barLen} v${barH} h${barLen} Z`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/equities/equityHeat.test.ts src/ui/equities/trade/buildCandles.test.ts src/ui/equities/blotters/buildGauge.test.ts src/ui/equities/blotters/buildSparkline.test.ts`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities
git commit -m "feat(rn): equities pure geometry utils (heat, candles, gauge, sparkline)"
```

---

### Task 2: Markets view — Watchlist + SectorHeatmap

**Files:**
- Create: `packages/client-react-native/src/ui/equities/markets/Watchlist.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/Watchlist.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/SectorHeatmap.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/SectorHeatmap.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/MarketsView.tsx`
- Create: `packages/client-react-native/src/ui/equities/markets/MarketsView.test.tsx`

**Interfaces:**
- Consumes: `heat`, `groupBySector` from Task 1; `useWatchlist`/`useEquityQuote` from `@rtc/react-bindings`.
- Produces: `Watchlist`, `SectorHeatmap`, `MarketsView` (all `{ selectedSymbol: string|null; onSelect: (symbol:string)=>void }`). Private `WatchlistRow` / `HeatCell` stay unexported.

- [ ] **Step 1: Write the failing tests**

`Watchlist.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { Watchlist } from "#/ui/equities/markets/Watchlist";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];
const QUOTES: Record<string, EquityQuote> = {
  AAPL: { symbol: "AAPL", bid: 181.9, ask: 182.1, last: 182.0, changePct: 1.2, timestamp: 0 },
  JPM: { symbol: "JPM", bid: 199.5, ask: 199.7, last: 199.6, changePct: -0.4, timestamp: 0 },
};

function fakeVM(instruments: readonly EquityInstrument[]): ViewModel {
  return {
    useWatchlist: () => instruments,
    useEquityQuote: (symbol: string) => QUOTES[symbol] ?? null,
  } as unknown as ViewModel;
}

async function renderWatchlist(instruments: readonly EquityInstrument[] = INSTS): Promise<void> {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeVM(instruments)}>
      <Watchlist selectedSymbol="AAPL" onSelect={() => {}} />
    </ViewModelProvider>,
  );
}

test("renders a row per instrument with last price and change", async () => {
  await renderWatchlist();
  expect(screen.getByTestId("watchlist-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("watchlist-row-JPM")).toBeTruthy();
  expect(screen.getByText("182.00")).toBeTruthy();
  expect(screen.getByText("+1.20%")).toBeTruthy();
  expect(screen.getByText("-0.40%")).toBeTruthy();
});

test("shows an empty state when there are no instruments", async () => {
  await renderWatchlist([]);
  expect(screen.getByTestId("watchlist-empty")).toBeTruthy();
});
```

`SectorHeatmap.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SectorHeatmap } from "#/ui/equities/markets/SectorHeatmap";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];

function fakeVM(instruments: readonly EquityInstrument[]): ViewModel {
  return {
    useWatchlist: () => instruments,
    useEquityQuote: (symbol: string): EquityQuote => ({ symbol, bid: 1, ask: 1, last: 1, changePct: 2, timestamp: 0 }),
  } as unknown as ViewModel;
}

test("renders a cell per instrument grouped by sector", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeVM(INSTS)}>
      <SectorHeatmap selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("heatmap-cell-AAPL")).toBeTruthy();
  expect(screen.getByTestId("heatmap-cell-JPM")).toBeTruthy();
  expect(screen.getByText("TECHNOLOGY")).toBeTruthy();
  expect(screen.getByText("FINANCE")).toBeTruthy();
});
```

`MarketsView.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];

test("composes the watchlist and sector heatmap", async () => {
  const vm = {
    useWatchlist: () => INSTS,
    useEquityQuote: () => null,
  } as unknown as ViewModel;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm}>
      <MarketsView selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("markets-view")).toBeTruthy();
  expect(screen.getByTestId("watchlist-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("heatmap-cell-AAPL")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/markets`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`markets/Watchlist.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import type { EquityInstrument } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { heat } from "#/ui/equities/equityHeat";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Scrollable instrument list. Each row mounts its own `useEquityQuote(symbol)`
 * (hooks at component top level), tinted by a heat overlay proportional to the
 * change%. Ported from web `Watchlist`. */
export function Watchlist({ selectedSymbol, onSelect }: WatchlistProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  if (instruments.length === 0) {
    return (
      <Text testID="watchlist-empty" style={styles.empty}>
        NO INSTRUMENTS
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      <View style={styles.header}>
        <Text style={styles.hSymbol}>SYMBOL</Text>
        <Text style={styles.hNum}>LAST</Text>
        <Text style={styles.hNum}>CHG%</Text>
        <Text style={styles.hNum}>SPRD</Text>
      </View>
      {instruments.map((inst) => {
        return (
          <WatchlistRow
            key={inst.symbol}
            instrument={inst}
            active={inst.symbol === selectedSymbol}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}

interface WatchlistProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface WatchlistRowProps {
  instrument: EquityInstrument;
  active: boolean;
  onSelect: (symbol: string) => void;
}

function WatchlistRow({ instrument, active, onSelect }: WatchlistRowProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(instrument.symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;
  const intensity = heat(changePct);
  const last = quote ? quote.last.toFixed(2) : "—";
  const change = quote ? `${up ? "+" : ""}${changePct.toFixed(2)}%` : "—";
  const spread = quote ? (quote.ask - quote.bid).toFixed(2) : "—";

  return (
    <Pressable
      testID={`watchlist-row-${instrument.symbol}`}
      style={active ? styles.rowActive : styles.row}
      onPress={() => {
        onSelect(instrument.symbol);
      }}
    >
      <View
        pointerEvents="none"
        style={[styles.heat, { backgroundColor: up ? theme.accentPositive : theme.accentNegative, opacity: intensity * 0.4 }]}
      />
      <Text style={styles.symbol}>{instrument.symbol}</Text>
      <Text style={styles.num}>{last}</Text>
      <Text style={[styles.num, up ? styles.up : styles.down]}>{change}</Text>
      <Text style={styles.num}>{spread}</Text>
    </Pressable>
  );
}

interface WatchlistStyles {
  list: ViewStyle;
  header: ViewStyle;
  hSymbol: TextStyle;
  hNum: TextStyle;
  row: ViewStyle;
  rowActive: ViewStyle;
  heat: ViewStyle;
  symbol: TextStyle;
  num: TextStyle;
  up: TextStyle;
  down: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): WatchlistStyles {
  const baseRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.borderSubtle,
  };
  const headerCell: TextStyle = { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono };
  return StyleSheet.create({
    list: { backgroundColor: t.panel },
    header: { ...baseRow, paddingVertical: 6 },
    hSymbol: { ...headerCell, flex: 2 },
    hNum: { ...headerCell, flex: 1, textAlign: "right" },
    row: baseRow,
    rowActive: { ...baseRow, backgroundColor: t.chip },
    heat: StyleSheet.absoluteFillObject,
    symbol: { flex: 2, fontSize: 13, color: t.textPrimary, fontFamily: t.fontDisplay },
    num: { flex: 1, fontSize: 13, color: t.textSecondary, fontFamily: t.fontMono, textAlign: "right" },
    up: { color: t.accentPositive },
    down: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
```

`markets/SectorHeatmap.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { groupBySector, heat } from "#/ui/equities/equityHeat";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Sector-grouped heat grid. Each cell mounts `useEquityQuote(symbol)` and
 * tints by change%. Ported from web `SectorHeatmap`. */
export function SectorHeatmap({ selectedSymbol, onSelect }: SectorHeatmapProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  if (instruments.length === 0) {
    return (
      <Text testID="heatmap-empty" style={styles.empty}>
        NO DATA
      </Text>
    );
  }

  return (
    <View style={styles.map}>
      {groupBySector(instruments).map((group) => {
        return (
          <View key={group.sector} style={styles.sectorRow}>
            <Text style={styles.sectorLabel}>{group.sector.toUpperCase()}</Text>
            <View style={styles.cellGrid}>
              {group.instruments.map((inst) => {
                return (
                  <HeatCell
                    key={inst.symbol}
                    symbol={inst.symbol}
                    active={inst.symbol === selectedSymbol}
                    onSelect={onSelect}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface SectorHeatmapProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface HeatCellProps {
  symbol: string;
  active: boolean;
  onSelect: (symbol: string) => void;
}

function HeatCell({ symbol, active, onSelect }: HeatCellProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;
  const intensity = heat(changePct);

  return (
    <Pressable
      testID={`heatmap-cell-${symbol}`}
      style={active ? styles.cellActive : styles.cell}
      onPress={() => {
        onSelect(symbol);
      }}
    >
      <View
        pointerEvents="none"
        style={[styles.heat, { backgroundColor: up ? theme.accentPositive : theme.accentNegative, opacity: intensity * 0.5 }]}
      />
      <Text style={styles.cellLabel}>{symbol}</Text>
    </Pressable>
  );
}

interface SectorHeatmapStyles {
  map: ViewStyle;
  sectorRow: ViewStyle;
  sectorLabel: TextStyle;
  cellGrid: ViewStyle;
  cell: ViewStyle;
  cellActive: ViewStyle;
  heat: ViewStyle;
  cellLabel: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): SectorHeatmapStyles {
  const baseCell: ViewStyle = {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
    overflow: "hidden",
    alignItems: "center",
  };
  return StyleSheet.create({
    map: { padding: 12, gap: 10 },
    sectorRow: { gap: 6 },
    sectorLabel: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    cellGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    cell: baseCell,
    cellActive: { ...baseCell, borderColor: t.accentPrimary, borderWidth: 1 },
    heat: StyleSheet.absoluteFillObject,
    cellLabel: { fontSize: 12, color: t.textPrimary, fontFamily: t.fontDisplay },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
```

`markets/MarketsView.tsx`:
```tsx
import type { JSX } from "react";
import { ScrollView, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { SectorHeatmap } from "#/ui/equities/markets/SectorHeatmap";
import { Watchlist } from "#/ui/equities/markets/Watchlist";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Markets sub-view: watchlist over sector heatmap. Selecting an instrument in
 * either flows up through `onSelect`. */
export function MarketsView({ selectedSymbol, onSelect }: MarketsViewProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView testID="markets-view" style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.heading}>WATCHLIST</Text>
        <Watchlist selectedSymbol={selectedSymbol} onSelect={onSelect} />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>SECTORS</Text>
        <SectorHeatmap selectedSymbol={selectedSymbol} onSelect={onSelect} />
      </View>
    </ScrollView>
  );
}

interface MarketsViewProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface MarketsViewStyles {
  scroll: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  heading: TextStyle;
}

function makeStyles(t: RnTheme): MarketsViewStyles {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bgPrimary },
    content: { gap: 16, paddingVertical: 12 },
    section: { gap: 6 },
    heading: { fontSize: 11, color: t.textSecondary, fontFamily: t.fontMono, paddingHorizontal: 12 },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/markets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/markets
git commit -m "feat(rn): equities Markets view (watchlist + sector heatmap)"
```

---

### Task 3: Trade market-data leaves — InstrumentTabs, PriceChart, DepthLadder

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/InstrumentTabs.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/InstrumentTabs.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/PriceChart.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/PriceChart.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/DepthLadder.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/DepthLadder.test.tsx`

**Interfaces:**
- Consumes: `buildCandles`/`CANDLE_WIDTH`/`CANDLE_HEIGHT` (Task 1); `useWatchlist`/`useCandles`/`useDepth`.
- Produces: `InstrumentTabs` (`{selectedSymbol,onSelect}`), `PriceChart` (`{symbol}`), `DepthLadder` (`{symbol}`). Private `DepthRow` unexported.

- [ ] **Step 1: Write the failing tests**

`InstrumentTabs.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
];

test("renders a tab per instrument and reports selection", async () => {
  const onSelect = jest.fn();
  const vm = { useWatchlist: () => INSTS } as unknown as ViewModel;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm}>
      <InstrumentTabs selectedSymbol="AAPL" onSelect={onSelect} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("instrument-tab-MSFT"));
  expect(onSelect).toHaveBeenCalledWith("MSFT");
});
```

`PriceChart.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PriceChart } from "#/ui/equities/trade/PriceChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vmWith(candles: readonly Candle[]): ViewModel {
  return { useCandles: () => candles } as unknown as ViewModel;
}
const CANDLES: readonly Candle[] = [
  { time: 1, open: 2, high: 10, low: 0, close: 8 },
  { time: 2, open: 8, high: 9, low: 3, close: 4 },
];

test("renders the chart svg when candles are present", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(CANDLES)}>
      <PriceChart symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("price-chart")).toBeTruthy();
});

test("shows an empty state when there are no candles", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <PriceChart symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("price-chart-empty")).toBeTruthy();
});
```

`DepthLadder.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { DepthBook } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { DepthLadder } from "#/ui/equities/trade/DepthLadder";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const BOOK: DepthBook = {
  symbol: "AAPL",
  bids: [{ price: 182.3, size: 500 }, { price: 182.2, size: 300 }],
  asks: [{ price: 182.5, size: 400 }, { price: 182.6, size: 200 }],
};

function vmWith(book: DepthBook | null): ViewModel {
  return { useDepth: () => book } as unknown as ViewModel;
}

test("renders bid/ask rows and the spread", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(BOOK)}>
      <DepthLadder symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("depth-ladder")).toBeTruthy();
  expect(screen.getByTestId("depth-row-ask-182.5")).toBeTruthy();
  expect(screen.getByTestId("depth-row-bid-182.3")).toBeTruthy();
  expect(screen.getByTestId("depth-spread")).toHaveTextContent("0.20", { exact: false });
});

test("shows an empty state when there is no depth book", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(null)}>
      <DepthLadder symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("depth-empty")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`trade/InstrumentTabs.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Horizontal symbol quick-switch strip. Ported from web `InstrumentTabs`. */
export function InstrumentTabs({ selectedSymbol, onSelect }: InstrumentTabsProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.content}>
      {instruments.map((inst) => {
        const active = inst.symbol === selectedSymbol;
        return (
          <Pressable
            key={inst.symbol}
            testID={`instrument-tab-${inst.symbol}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onSelect(inst.symbol);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>{inst.symbol}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface InstrumentTabsProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface InstrumentTabsStyles {
  strip: ViewStyle;
  content: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentTabsStyles {
  const baseTab: ViewStyle = {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
  };
  return StyleSheet.create({
    strip: { flexGrow: 0, backgroundColor: t.bgHeader },
    content: { gap: 6, padding: 8 },
    tab: baseTab,
    tabActive: { ...baseTab, backgroundColor: t.chip, borderColor: t.accentPrimary },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontMono },
    labelActive: { fontSize: 12, color: t.textPrimary, fontFamily: t.fontMono },
  });
}
```

`trade/PriceChart.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import { buildCandles, CANDLE_HEIGHT, CANDLE_WIDTH } from "#/ui/equities/trade/buildCandles";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** SVG candlestick chart. Geometry from the pure `buildCandles`; colours from
 * the theme. Ported from web canvas `PriceChart`. */
export function PriceChart({ symbol }: PriceChartProps): JSX.Element {
  const { useCandles } = useViewModel();
  const candles = useCandles(symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const geoms = buildCandles(candles);

  return (
    <View style={styles.wrapper}>
      <Svg
        testID="price-chart"
        width="100%"
        height={CANDLE_HEIGHT}
        viewBox={`0 0 ${CANDLE_WIDTH} ${CANDLE_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {geoms.map((g, i) => {
          const color = g.up ? theme.accentPositive : theme.accentNegative;
          return (
            <G key={i}>
              <Line x1={g.x} y1={g.wickTop} x2={g.x} y2={g.wickBottom} stroke={color} strokeWidth={1} />
              <Rect x={g.x - g.barW / 2} y={g.bodyY} width={g.barW} height={g.bodyH} fill={color} />
            </G>
          );
        })}
      </Svg>
      {candles.length === 0 ? (
        <Text testID="price-chart-empty" style={styles.empty}>
          NO DATA
        </Text>
      ) : null}
    </View>
  );
}

interface PriceChartProps {
  symbol: string;
}

interface PriceChartStyles {
  wrapper: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): PriceChartStyles {
  return StyleSheet.create({
    wrapper: {
      height: CANDLE_HEIGHT,
      backgroundColor: t.panel,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderSubtle,
      overflow: "hidden",
      justifyContent: "center",
    },
    empty: {
      position: "absolute",
      alignSelf: "center",
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 12,
    },
  });
}
```
> `G key={i}` — index keys are stable here because candle order never reorders (append-only history); `PnlChart` uses the same positional approach for its path points.

`trade/DepthLadder.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import type { DepthLevel } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Bid/ask depth ladder with size bars. Asks reversed (lowest at the bottom,
 * nearest the mid), 8 levels/side, bar width normalised by max size. Ported
 * from web `DepthLadder`. */
export function DepthLadder({ symbol }: DepthLadderProps): JSX.Element {
  const { useDepth } = useViewModel();
  const book = useDepth(symbol);
  const styles = useThemedStyles(makeStyles);

  if (!book) {
    return (
      <Text testID="depth-empty" style={styles.empty}>
        NO DEPTH DATA
      </Text>
    );
  }

  const allSizes = [...book.bids.map((l) => l.size), ...book.asks.map((l) => l.size)];
  const maxSize = Math.max(...allSizes, 1);
  const asks = [...book.asks].slice(0, 8).reverse();
  const bids = book.bids.slice(0, 8);
  const bestAsk = book.asks[0]?.price ?? 0;
  const bestBid = book.bids[0]?.price ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? (bestAsk - bestBid).toFixed(2) : "—";

  return (
    <View testID="depth-ladder" style={styles.ladder}>
      <Text style={styles.sectionLabel}>ASKS</Text>
      {asks.map((level) => {
        return <DepthRow key={`ask-${level.price}`} level={level} side="ask" depth={level.size / maxSize} />;
      })}
      <Text testID="depth-spread" style={styles.spread}>
        SPREAD {spread}
      </Text>
      <Text style={styles.sectionLabel}>BIDS</Text>
      {bids.map((level) => {
        return <DepthRow key={`bid-${level.price}`} level={level} side="bid" depth={level.size / maxSize} />;
      })}
    </View>
  );
}

interface DepthLadderProps {
  symbol: string;
}

interface DepthRowProps {
  level: DepthLevel;
  side: "bid" | "ask";
  depth: number;
}

function DepthRow({ level, side, depth }: DepthRowProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = side === "ask" ? theme.accentNegative : theme.accentPositive;
  return (
    <View testID={`depth-row-${side}-${level.price}`} style={styles.row}>
      <View pointerEvents="none" style={[styles.bar, { backgroundColor: color, width: `${depth * 100}%` }]} />
      <Text style={styles.price}>{level.price.toFixed(2)}</Text>
      <Text style={styles.size}>{level.size.toLocaleString()}</Text>
    </View>
  );
}

interface DepthLadderStyles {
  ladder: ViewStyle;
  sectionLabel: TextStyle;
  spread: TextStyle;
  row: ViewStyle;
  bar: ViewStyle;
  price: TextStyle;
  size: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): DepthLadderStyles {
  return StyleSheet.create({
    ladder: { backgroundColor: t.panel, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: t.borderSubtle, padding: 8, gap: 2 },
    sectionLabel: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    spread: { fontSize: 11, color: t.textSecondary, fontFamily: t.fontMono, textAlign: "center", paddingVertical: 4 },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: 4, overflow: "hidden" },
    bar: { ...StyleSheet.absoluteFillObject, right: undefined, opacity: 0.18 },
    price: { flex: 1, fontSize: 12, color: t.textPrimary, fontFamily: t.fontMono },
    size: { flex: 1, fontSize: 12, color: t.textSecondary, fontFamily: t.fontMono, textAlign: "right" },
  });
}
```
> The depth bar is an absolute-fill layer whose `width` (a `%`) is the runtime geometry — inline style array, exactly the `RfqCountdownBar` pattern. `right: undefined` lets the width own the horizontal extent from the left edge.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/trade
git commit -m "feat(rn): equities trade market-data leaves (tabs, chart, depth)"
```

---

### Task 4: Order ticket

The 6-phase order lifecycle. Ported from web `OrderTicket`, dropping the web-only `useAnimationIntents` (not bound in RN).

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/OrderTicket.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/OrderTicket.test.tsx`

**Interfaces:**
- Consumes: `useOrderTicket(symbol)` → `{ state, setSide, setType, setQty, setLimitPrice, submit, reset }`.
- Produces: `OrderTicket` (`{ symbol }`).

- [ ] **Step 1: Write the failing test**

`OrderTicket.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vmWith(state: OrderTicketState, intents: Partial<Record<string, unknown>> = {}): ViewModel {
  return {
    useOrderTicket: () => ({
      state,
      setSide: intents.setSide ?? (() => {}),
      setType: intents.setType ?? (() => {}),
      setQty: intents.setQty ?? (() => {}),
      setLimitPrice: intents.setLimitPrice ?? (() => {}),
      submit: intents.submit ?? (() => {}),
      reset: intents.reset ?? (() => {}),
    }),
  } as unknown as ViewModel;
}

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 100 },
  error: null,
};

test("editing phase submits with the current side and symbol", async () => {
  const submit = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(editing, { submit })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket-submit")).toHaveTextContent("BUY AAPL", { exact: false });
  void fireEvent.press(screen.getByTestId("order-ticket-submit"));
  expect(submit).toHaveBeenCalledTimes(1);
});

test("filled phase shows the fill summary and a reset control", async () => {
  const reset = jest.fn();
  const filled: OrderTicketState = {
    phase: "filled",
    order: { id: "o1", symbol: "AAPL", side: "buy", type: "market", qty: 100, status: "filled", filledQty: 100, avgPrice: 182.4, createdAt: 0 },
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(filled, { reset })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket")).toHaveTextContent("FILLED", { exact: false });
  void fireEvent.press(screen.getByTestId("order-ticket-reset"));
  expect(reset).toHaveBeenCalledTimes(1);
});

test("rejected phase surfaces the reason", async () => {
  const rejected: OrderTicketState = { phase: "rejected", reason: "Insufficient buying power" };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(rejected)}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket")).toHaveTextContent("Insufficient buying power", { exact: false });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade/OrderTicket.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `trade/OrderTicket.tsx`**

```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, TextInput, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Equity order ticket — side/type toggles, qty, optional limit price, Submit,
 * plus the terminal/in-flight phases (submitting/working/partiallyFilled/
 * filled/rejected). All state + intents from `useOrderTicket(symbol)`. Ported
 * from web `OrderTicket` without the web-only fill animation intent. */
export function OrderTicket({ symbol }: OrderTicketProps): JSX.Element {
  const { useOrderTicket } = useViewModel();
  const ticket = useOrderTicket(symbol);
  const { state } = ticket;
  const styles = useThemedStyles(makeStyles);

  if (state.phase === "submitting") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>SUBMITTING…</Text>
      </View>
    );
  }

  if (state.phase === "working") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>WORKING — {state.order.filledQty}/{state.order.qty} filled</Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "partiallyFilled") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>PARTIAL — {state.order.filledQty}/{state.order.qty} @ {state.order.avgPrice?.toFixed(2) ?? "—"}</Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "filled") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>FILLED — {state.order.qty} @ {state.order.avgPrice?.toFixed(2) ?? "—"}</Text>
        <ResetButton label="NEW ORDER" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "rejected") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>REJECTED — {state.reason}</Text>
        <ResetButton label="RETRY" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  const { form, error } = state;
  const isLimit = form.type === "limit";
  const buy = form.side === "buy";

  return (
    <View testID="order-ticket" style={styles.ticket}>
      <View style={styles.toggleGroup}>
        <Pressable testID="order-ticket-side-buy" style={buy ? styles.buyActive : styles.toggle} onPress={() => ticket.setSide("buy")}>
          <Text style={buy ? styles.toggleLabelOn : styles.toggleLabel}>BUY</Text>
        </Pressable>
        <Pressable testID="order-ticket-side-sell" style={!buy ? styles.sellActive : styles.toggle} onPress={() => ticket.setSide("sell")}>
          <Text style={!buy ? styles.toggleLabelOn : styles.toggleLabel}>SELL</Text>
        </Pressable>
      </View>

      <View style={styles.toggleGroup}>
        <Pressable testID="order-ticket-type-market" style={!isLimit ? styles.typeActive : styles.toggle} onPress={() => ticket.setType("market")}>
          <Text style={!isLimit ? styles.toggleLabelOn : styles.toggleLabel}>MARKET</Text>
        </Pressable>
        <Pressable testID="order-ticket-type-limit" style={isLimit ? styles.typeActive : styles.toggle} onPress={() => ticket.setType("limit")}>
          <Text style={isLimit ? styles.toggleLabelOn : styles.toggleLabel}>LIMIT</Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>QUANTITY</Text>
        <TextInput
          testID="order-ticket-qty"
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={styles.label.color}
          value={form.qty === 0 ? "" : String(form.qty)}
          onChangeText={(text) => {
            const n = Number(text);
            if (Number.isFinite(n)) ticket.setQty(n);
          }}
        />
      </View>

      {isLimit ? (
        <View style={styles.field}>
          <Text style={styles.label}>LIMIT PRICE</Text>
          <TextInput
            testID="order-ticket-limit"
            style={styles.input}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={styles.label.color}
            value={form.limitPrice === undefined ? "" : String(form.limitPrice)}
            onChangeText={(text) => {
              const n = text === "" ? undefined : Number(text);
              ticket.setLimitPrice(Number.isFinite(n) ? n : undefined);
            }}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable testID="order-ticket-submit" style={buy ? styles.submitBuy : styles.submitSell} onPress={ticket.submit}>
        <Text style={styles.submitLabel}>{buy ? "BUY" : "SELL"} {symbol}</Text>
      </Pressable>
    </View>
  );
}

interface OrderTicketProps {
  symbol: string;
}

interface ResetButtonProps {
  label: string;
  onPress: () => void;
  styles: OrderTicketStyles;
}

function ResetButton({ label, onPress, styles }: ResetButtonProps): JSX.Element {
  return (
    <Pressable testID="order-ticket-reset" style={styles.resetBtn} onPress={onPress}>
      <Text style={styles.resetLabel}>{label}</Text>
    </Pressable>
  );
}

interface OrderTicketStyles {
  ticket: ViewStyle;
  status: TextStyle;
  toggleGroup: ViewStyle;
  toggle: ViewStyle;
  buyActive: ViewStyle;
  sellActive: ViewStyle;
  typeActive: ViewStyle;
  toggleLabel: TextStyle;
  toggleLabelOn: TextStyle;
  field: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  error: TextStyle;
  submitBuy: ViewStyle;
  submitSell: ViewStyle;
  submitLabel: TextStyle;
  resetBtn: ViewStyle;
  resetLabel: TextStyle;
}

function makeStyles(t: RnTheme): OrderTicketStyles {
  const baseToggle: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
    backgroundColor: t.bgSecondary,
  };
  const baseSubmit: ViewStyle = { alignItems: "center", paddingVertical: 12, borderRadius: 6, marginTop: 4 };
  return StyleSheet.create({
    ticket: { gap: 10, padding: 12, backgroundColor: t.panel, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: t.borderSubtle },
    status: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontMono },
    toggleGroup: { flexDirection: "row", gap: 8 },
    toggle: baseToggle,
    buyActive: { ...baseToggle, backgroundColor: t.accentPositive, borderColor: t.accentPositive },
    sellActive: { ...baseToggle, backgroundColor: t.accentNegative, borderColor: t.accentNegative },
    typeActive: { ...baseToggle, backgroundColor: t.accentPrimary, borderColor: t.accentPrimary },
    // textOnAccent is legible only on an accent fill — used ONLY on the active
    // (accent-filled) toggle; inactive toggles use textSecondary on bgSecondary.
    toggleLabel: { fontSize: 13, color: t.textSecondary, fontFamily: t.fontDisplay },
    toggleLabelOn: { fontSize: 13, color: t.textOnAccent, fontFamily: t.fontDisplay },
    field: { gap: 4 },
    label: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    input: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      backgroundColor: t.bgSecondary,
      color: t.textPrimary,
      fontFamily: t.fontMono,
      fontSize: 14,
    },
    error: { fontSize: 12, color: t.accentNegative, fontFamily: t.fontMono },
    submitBuy: { ...baseSubmit, backgroundColor: t.accentPositive },
    submitSell: { ...baseSubmit, backgroundColor: t.accentNegative },
    submitLabel: { fontSize: 14, color: t.textOnAccent, fontFamily: t.fontDisplay },
    resetBtn: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: t.border },
    resetLabel: { fontSize: 12, color: t.textSecondary, fontFamily: t.fontDisplay },
  });
}
```
> **Legibility (Phase 7 lesson):** `textOnAccent` appears ONLY on accent-filled surfaces (active toggle, submit button). Inactive toggles and the reset button use `textSecondary` on `bgSecondary`/bordered surfaces. This must hold across all 8 skins — the whole-branch review verifies it.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade/OrderTicket.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/trade/OrderTicket.tsx packages/client-react-native/src/ui/equities/trade/OrderTicket.test.tsx
git commit -m "feat(rn): equities order ticket (6-phase lifecycle)"
```

---

### Task 5: Trade view

Composes the Task 3 + Task 4 leaves; empty-prompt when no symbol is selected.

**Files:**
- Create: `packages/client-react-native/src/ui/equities/trade/TradeView.tsx`
- Create: `packages/client-react-native/src/ui/equities/trade/TradeView.test.tsx`

**Interfaces:**
- Consumes: `InstrumentTabs`, `PriceChart`, `DepthLadder`, `OrderTicket`.
- Produces: `TradeView` (`{ selectedSymbol: string|null; onSelect: (symbol:string)=>void }`).

- [ ] **Step 1: Write the failing test**

`TradeView.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type { Candle, DepthBook, EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeView } from "#/ui/equities/trade/TradeView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = { phase: "editing", form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 }, error: null };

function fullVM(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }],
    useCandles: (): readonly Candle[] => [],
    useDepth: (): DepthBook | null => null,
    useOrderTicket: () => ({ state: editing, setSide: () => {}, setType: () => {}, setQty: () => {}, setLimitPrice: () => {}, submit: () => {}, reset: () => {} }),
  } as unknown as ViewModel;
}

test("prompts to pick an instrument when none is selected", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fullVM()}>
      <TradeView selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("trade-empty")).toBeTruthy();
});

test("renders tabs, chart, depth and ticket for the selected symbol", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fullVM()}>
      <TradeView selectedSymbol="AAPL" onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  expect(screen.getByTestId("price-chart")).toBeTruthy();
  expect(screen.getByTestId("depth-empty")).toBeTruthy(); // null book → empty
  expect(screen.getByTestId("order-ticket")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade/TradeView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `trade/TradeView.tsx`**

```tsx
import type { JSX } from "react";
import { ScrollView, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { DepthLadder } from "#/ui/equities/trade/DepthLadder";
import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { PriceChart } from "#/ui/equities/trade/PriceChart";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Trade sub-view for the selected symbol: quick-switch tabs, price chart,
 * depth ladder, order ticket. Shows a prompt until a symbol is chosen. */
export function TradeView({ selectedSymbol, onSelect }: TradeViewProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  if (selectedSymbol === null) {
    return (
      <View testID="trade-empty" style={styles.empty}>
        <Text style={styles.emptyText}>Select an instrument from Markets</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InstrumentTabs selectedSymbol={selectedSymbol} onSelect={onSelect} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>{selectedSymbol} — PRICE</Text>
          <PriceChart symbol={selectedSymbol} />
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>DEPTH</Text>
          <DepthLadder symbol={selectedSymbol} />
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>ORDER TICKET</Text>
          <OrderTicket symbol={selectedSymbol} />
        </View>
      </ScrollView>
    </View>
  );
}

interface TradeViewProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface TradeViewStyles {
  container: ViewStyle;
  scroll: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  heading: TextStyle;
  empty: ViewStyle;
  emptyText: TextStyle;
}

function makeStyles(t: RnTheme): TradeViewStyles {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bgPrimary },
    scroll: { flex: 1 },
    content: { gap: 16, padding: 12 },
    section: { gap: 6 },
    heading: { fontSize: 11, color: t.textSecondary, fontFamily: t.fontMono },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary, padding: 24 },
    emptyText: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/trade/TradeView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/trade/TradeView.tsx packages/client-react-native/src/ui/equities/trade/TradeView.test.tsx
git commit -m "feat(rn): equities Trade view (tabs + chart + depth + ticket)"
```

---

### Task 6: Blotters view — Orders, Positions, DeskPnlGauge, PnlSparkline

**Files:**
- Create: `packages/client-react-native/src/ui/equities/blotters/OrdersBlotter.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/OrdersBlotter.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/PnlSparkline.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/DeskPnlGauge.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/PositionsBlotter.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/PositionsBlotter.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/BlottersView.tsx`
- Create: `packages/client-react-native/src/ui/equities/blotters/BlottersView.test.tsx`

**Interfaces:**
- Consumes: `buildGaugePaths`+gauge consts, `buildSparkPath`+spark consts (Task 1); `useEquityOrders`, `useEquityPositions`.
- Produces: `OrdersBlotter` (`()`), `PnlSparkline` (`{pnl,maxAbsPnl?}`), `DeskPnlGauge` (`{positions}`), `PositionsBlotter` (`()`), `BlottersView` (`()`).

- [ ] **Step 1: Write the failing tests**

`OrdersBlotter.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityOrder } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vmWith(orders: readonly EquityOrder[]): ViewModel {
  return { useEquityOrders: () => orders } as unknown as ViewModel;
}

test("renders a row per order", async () => {
  const orders: readonly EquityOrder[] = [
    { id: "o1", symbol: "AAPL", side: "buy", type: "market", qty: 100, status: "filled", filledQty: 100, avgPrice: 182.4, createdAt: 0 },
  ];
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(orders)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-row-o1")).toBeTruthy();
  expect(screen.getByText("182.40")).toBeTruthy();
});

test("shows an empty state with no orders", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("orders-empty")).toBeTruthy();
});
```

`PositionsBlotter.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityPosition } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vmWith(positions: readonly EquityPosition[]): ViewModel {
  return { useEquityPositions: () => positions } as unknown as ViewModel;
}

test("renders the desk gauge plus a row per position", async () => {
  const positions: readonly EquityPosition[] = [
    { symbol: "AAPL", qty: 100, avgPrice: 180, markPrice: 182, unrealisedPnl: 200 },
    { symbol: "JPM", qty: 50, avgPrice: 200, markPrice: 198, unrealisedPnl: -100 },
  ];
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(positions)}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("position-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("position-row-JPM")).toBeTruthy();
});

test("shows the gauge and an empty state with no positions", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("positions-empty")).toBeTruthy();
});
```

`BlottersView.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(): ViewModel {
  return { useEquityOrders: () => [], useEquityPositions: () => [] } as unknown as ViewModel;
}

test("defaults to Orders and switches to Positions", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <BlottersView />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("orders-empty")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("blotter-toggle-positions"));
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("positions-empty")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/blotters`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`blotters/OrdersBlotter.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Read-only orders table. Ported from web `OrdersBlotter`. */
export function OrdersBlotter(): JSX.Element {
  const { useEquityOrders } = useViewModel();
  const orders = useEquityOrders();
  const styles = useThemedStyles(makeStyles);

  if (orders.length === 0) {
    return (
      <Text testID="orders-empty" style={styles.empty}>
        NO ORDERS
      </Text>
    );
  }

  return (
    <View style={styles.blotter}>
      <View style={styles.header}>
        <Text style={styles.hCell}>SYMBOL</Text>
        <Text style={styles.hCell}>SIDE</Text>
        <Text style={styles.hCell}>TYPE</Text>
        <Text style={styles.hCell}>QTY</Text>
        <Text style={styles.hCell}>PRICE</Text>
        <Text style={styles.hCell}>STATUS</Text>
      </View>
      {orders.map((order) => {
        return (
          <View key={order.id} testID={`order-row-${order.id}`} style={styles.row}>
            <Text style={styles.cell}>{order.symbol}</Text>
            <Text style={[styles.cell, order.side === "buy" ? styles.buy : styles.sell]}>{order.side.toUpperCase()}</Text>
            <Text style={styles.cell}>{order.type}</Text>
            <Text style={styles.cell}>{order.filledQty}/{order.qty}</Text>
            <Text style={styles.cell}>{order.avgPrice ? order.avgPrice.toFixed(2) : "—"}</Text>
            <Text style={styles.cell}>{order.status.toUpperCase()}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface OrdersBlotterStyles {
  blotter: ViewStyle;
  header: ViewStyle;
  hCell: TextStyle;
  row: ViewStyle;
  cell: TextStyle;
  buy: TextStyle;
  sell: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): OrdersBlotterStyles {
  const rowBase: ViewStyle = { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.borderSubtle };
  return StyleSheet.create({
    blotter: { backgroundColor: t.panel },
    header: { ...rowBase, paddingVertical: 6 },
    hCell: { flex: 1, fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    row: rowBase,
    cell: { flex: 1, fontSize: 12, color: t.textSecondary, fontFamily: t.fontMono },
    buy: { color: t.accentPositive },
    sell: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
```

`blotters/PnlSparkline.tsx`:
```tsx
import type { JSX } from "react";
import Svg, { Line, Path } from "react-native-svg";

import { buildSparkPath, SPARK_HALF_W, SPARK_HEIGHT, SPARK_PAD, SPARK_WIDTH } from "#/ui/equities/blotters/buildSparkline";
import { useTheme } from "#/ui/theme/useTheme";

/** Mini per-position P&L bar sparkline. Geometry from pure `buildSparkPath`.
 * Ported from web `PnlSparkline`. */
export function PnlSparkline({ pnl, maxAbsPnl }: PnlSparklineProps): JSX.Element {
  const theme = useTheme();
  const safe = maxAbsPnl !== undefined ? maxAbsPnl : Math.abs(pnl);
  const path = buildSparkPath(pnl, safe);
  const color = pnl >= 0 ? theme.accentPositive : theme.accentNegative;
  return (
    <Svg testID="pnl-sparkline" width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}>
      <Line x1={SPARK_PAD + SPARK_HALF_W} y1={SPARK_PAD} x2={SPARK_PAD + SPARK_HALF_W} y2={SPARK_HEIGHT - SPARK_PAD} stroke={theme.border} strokeWidth={1} />
      <Path d={path} fill={color} opacity={0.7} />
    </Svg>
  );
}

interface PnlSparklineProps {
  pnl: number;
  maxAbsPnl?: number;
}
```

`blotters/DeskPnlGauge.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { EquityPosition } from "@rtc/domain";

import { buildGaugePaths, GAUGE_CX, GAUGE_CY, GAUGE_PAD, GAUGE_R } from "#/ui/equities/blotters/buildGauge";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Lower-arc desk-P&L speedometer. Geometry from pure `buildGaugePaths`.
 * Ported from web `DeskPnlGauge`. */
export function DeskPnlGauge({ positions }: DeskPnlGaugeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const totalPnl = positions.reduce((acc, p) => acc + p.unrealisedPnl, 0);
  const maxAbsPnl = Math.max(...positions.map((p) => Math.abs(p.unrealisedPnl)), 1);
  const isPositive = totalPnl >= 0;
  const arcColor = isPositive ? theme.accentPositive : theme.accentNegative;
  const { track, fill, needleX, needleY } = buildGaugePaths(totalPnl, maxAbsPnl);

  const displayPnl = Math.abs(totalPnl) >= 1000 ? `${(totalPnl / 1000).toFixed(1)}k` : totalPnl.toFixed(0);
  const viewBoxY = GAUGE_CY - GAUGE_PAD;
  const viewBoxH = GAUGE_R + GAUGE_PAD * 2;
  const viewBoxW = GAUGE_CX * 2 + 4;

  return (
    <View testID="desk-pnl-gauge" style={styles.gauge}>
      <Svg width={viewBoxW} height={viewBoxH} viewBox={`0 ${viewBoxY} ${viewBoxW} ${viewBoxH}`}>
        <Path d={track} fill="none" stroke={theme.border} strokeWidth={6} strokeLinecap="round" />
        {fill !== null ? <Path d={fill} fill="none" stroke={arcColor} strokeWidth={6} strokeLinecap="round" /> : null}
        <Circle cx={needleX} cy={needleY} r={4} fill={arcColor} />
        <Circle cx={GAUGE_CX} cy={GAUGE_CY} r={3} fill={theme.border} />
      </Svg>
      <Text style={styles.label}>DESK P&amp;L</Text>
      <Text testID="desk-pnl-value" style={[styles.value, { color: arcColor }]}>
        {isPositive ? "+" : ""}{displayPnl}
      </Text>
    </View>
  );
}

interface DeskPnlGaugeProps {
  positions: readonly EquityPosition[];
}

interface DeskPnlGaugeStyles {
  gauge: ViewStyle;
  label: TextStyle;
  value: TextStyle;
}

function makeStyles(t: RnTheme): DeskPnlGaugeStyles {
  return StyleSheet.create({
    gauge: { alignItems: "center", paddingVertical: 8, gap: 2 },
    label: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    value: { fontSize: 18, fontFamily: t.fontDisplay },
  });
}
```

`blotters/PositionsBlotter.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { DeskPnlGauge } from "#/ui/equities/blotters/DeskPnlGauge";
import { PnlSparkline } from "#/ui/equities/blotters/PnlSparkline";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Positions table with a desk-P&L gauge and per-row sparklines. Ported from
 * web `PositionsBlotter`. */
export function PositionsBlotter(): JSX.Element {
  const { useEquityPositions } = useViewModel();
  const positions = useEquityPositions();
  const styles = useThemedStyles(makeStyles);
  const maxAbsPnl = Math.max(...positions.map((p) => Math.abs(p.unrealisedPnl)), 1);

  return (
    <View style={styles.wrapper}>
      <DeskPnlGauge positions={positions} />
      {positions.length === 0 ? (
        <Text testID="positions-empty" style={styles.empty}>
          NO POSITIONS
        </Text>
      ) : (
        <View style={styles.blotter}>
          <View style={styles.header}>
            <Text style={styles.hCell}>SYMBOL</Text>
            <Text style={styles.hCell}>QTY</Text>
            <Text style={styles.hCell}>AVG</Text>
            <Text style={styles.hCell}>MARK</Text>
            <Text style={styles.hCell}>UPNL</Text>
            <Text style={styles.hSpark}>SPARK</Text>
          </View>
          {positions.map((pos) => {
            const up = pos.unrealisedPnl >= 0;
            const pnlDisplay = up ? `+${pos.unrealisedPnl.toFixed(0)}` : pos.unrealisedPnl.toFixed(0);
            return (
              <View key={pos.symbol} testID={`position-row-${pos.symbol}`} style={styles.row}>
                <Text style={styles.cell}>{pos.symbol}</Text>
                <Text style={styles.cell}>{pos.qty.toLocaleString()}</Text>
                <Text style={styles.cell}>{pos.avgPrice.toFixed(2)}</Text>
                <Text style={styles.cell}>{pos.markPrice.toFixed(2)}</Text>
                <Text style={[styles.cell, up ? styles.pos : styles.neg]}>{pnlDisplay}</Text>
                <View style={styles.sparkCell}>
                  <PnlSparkline pnl={pos.unrealisedPnl} maxAbsPnl={maxAbsPnl} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface PositionsBlotterStyles {
  wrapper: ViewStyle;
  blotter: ViewStyle;
  header: ViewStyle;
  hCell: TextStyle;
  hSpark: TextStyle;
  row: ViewStyle;
  cell: TextStyle;
  sparkCell: ViewStyle;
  pos: TextStyle;
  neg: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): PositionsBlotterStyles {
  const rowBase: ViewStyle = { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.borderSubtle };
  return StyleSheet.create({
    wrapper: { backgroundColor: t.panel },
    blotter: {},
    header: { ...rowBase, paddingVertical: 6 },
    hCell: { flex: 1, fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    hSpark: { flex: 1.4, fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    row: rowBase,
    cell: { flex: 1, fontSize: 12, color: t.textSecondary, fontFamily: t.fontMono },
    sparkCell: { flex: 1.4 },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
```

`blotters/BlottersView.tsx`:
```tsx
import type { JSX } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

type BlotterTab = "orders" | "positions";

/** Blotters sub-view: an Orders/Positions toggle over the two blotters. */
export function BlottersView(): JSX.Element {
  const [tab, setTab] = useState<BlotterTab>("orders");
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Pressable testID="blotter-toggle-orders" style={tab === "orders" ? styles.toggleActive : styles.toggle} onPress={() => setTab("orders")}>
          <Text style={tab === "orders" ? styles.labelActive : styles.label}>ORDERS</Text>
        </Pressable>
        <Pressable testID="blotter-toggle-positions" style={tab === "positions" ? styles.toggleActive : styles.toggle} onPress={() => setTab("positions")}>
          <Text style={tab === "positions" ? styles.labelActive : styles.label}>POSITIONS</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === "orders" ? <OrdersBlotter /> : <PositionsBlotter />}
      </ScrollView>
    </View>
  );
}

interface BlottersViewStyles {
  container: ViewStyle;
  toggleRow: ViewStyle;
  toggle: ViewStyle;
  toggleActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
  scroll: ViewStyle;
  content: ViewStyle;
}

function makeStyles(t: RnTheme): BlottersViewStyles {
  const baseToggle: ViewStyle = { flex: 1, alignItems: "center", paddingVertical: 12 };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bgPrimary },
    toggleRow: { flexDirection: "row", backgroundColor: t.bgHeader, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.borderSubtle },
    toggle: baseToggle,
    toggleActive: { ...baseToggle, borderBottomWidth: 2, borderBottomColor: t.accentPrimary },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: { fontSize: 12, color: t.textPrimary, fontFamily: t.fontDisplay },
    scroll: { flex: 1 },
    content: { padding: 12 },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/blotters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/blotters
git commit -m "feat(rn): equities Blotters view (orders, positions, gauge, sparkline)"
```

---

### Task 7: Equities screen + nav

Ties the three views together; owns `selectedSymbol` and the active view.

**Files:**
- Create: `packages/client-react-native/src/ui/equities/EquitiesNav.tsx`
- Create: `packages/client-react-native/src/ui/equities/EquitiesNav.test.tsx`
- Create: `packages/client-react-native/src/ui/equities/EquitiesScreen.tsx`
- Create: `packages/client-react-native/src/ui/equities/EquitiesScreen.test.tsx`

**Interfaces:**
- Consumes: `MarketsView`, `TradeView`, `BlottersView`.
- Produces: `EquitiesNav` (`{ view: EquitiesView; onChange }`, `EquitiesView="markets"|"trade"|"blotters"`), `EquitiesScreen` (`()`).

- [ ] **Step 1: Write the failing tests**

`EquitiesNav.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { EquitiesNav } from "#/ui/equities/EquitiesNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three segments and reports a change", async () => {
  const onChange = jest.fn();
  await renderWithTheme(<EquitiesNav view="markets" onChange={onChange} />);
  expect(screen.getByTestId("equities-tab-markets")).toBeTruthy();
  expect(screen.getByTestId("equities-tab-trade")).toBeTruthy();
  expect(screen.getByTestId("equities-tab-blotters")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("equities-tab-trade"));
  expect(onChange).toHaveBeenCalledWith("trade");
});
```

`EquitiesScreen.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type { Candle, DepthBook, EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { EquitiesScreen } from "#/ui/equities/EquitiesScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = { phase: "editing", form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 }, error: null };

function vm(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }],
    useEquityQuote: () => null,
    useCandles: (): readonly Candle[] => [],
    useDepth: (): DepthBook | null => null,
    useEquityOrders: () => [],
    useEquityPositions: () => [],
    useOrderTicket: () => ({ state: editing, setSide: () => {}, setType: () => {}, setQty: () => {}, setLimitPrice: () => {}, submit: () => {}, reset: () => {} }),
  } as unknown as ViewModel;
}

async function renderScreen(): Promise<void> {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <EquitiesScreen />
    </ViewModelProvider>,
  );
}

test("starts on Markets", async () => {
  await renderScreen();
  expect(screen.getByTestId("equities-screen")).toBeTruthy();
  expect(screen.getByTestId("markets-view")).toBeTruthy();
});

test("Trade prompts until a symbol is chosen", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("equities-tab-trade"));
  expect(screen.getByTestId("trade-empty")).toBeTruthy();
});

test("selecting a watchlist instrument jumps to Trade for that symbol", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("watchlist-row-AAPL"));
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  expect(screen.getByTestId("order-ticket")).toBeTruthy();
});

test("Blotters view is reachable", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("equities-tab-blotters"));
  expect(screen.getByTestId("blotter-toggle-orders")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/EquitiesNav.test.tsx src/ui/equities/EquitiesScreen.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`EquitiesNav.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export type EquitiesView = "markets" | "trade" | "blotters";

interface EquitiesTab {
  view: EquitiesView;
  label: string;
}

const TABS: readonly EquitiesTab[] = [
  { view: "markets", label: "Markets" },
  { view: "trade", label: "Trade" },
  { view: "blotters", label: "Blotters" },
];

interface EquitiesNavProps {
  view: EquitiesView;
  onChange: (view: EquitiesView) => void;
}

/** Segmented control over the three equities sub-views. Mirrors `CreditNav`. */
export function EquitiesNav({ view, onChange }: EquitiesNavProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.nav} testID="equities-nav">
      {TABS.map((tab) => {
        const active = tab.view === view;
        return (
          <Pressable
            key={tab.view}
            testID={`equities-tab-${tab.view}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onChange(tab.view);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface EquitiesNavStyles {
  nav: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): EquitiesNavStyles {
  const baseTab: ViewStyle = { flex: 1, alignItems: "center", paddingVertical: 12 };
  return StyleSheet.create({
    nav: { flexDirection: "row", backgroundColor: t.bgHeader, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.borderSubtle },
    tab: baseTab,
    tabActive: { ...baseTab, borderBottomWidth: 2, borderBottomColor: t.accentPrimary },
    label: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
```

`EquitiesScreen.tsx`:
```tsx
import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { EquitiesNav, type EquitiesView } from "#/ui/equities/EquitiesNav";
import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { TradeView } from "#/ui/equities/trade/TradeView";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Equities tab: a segmented control over Markets / Trade / Blotters. The
 * selected symbol is lifted here; selecting an instrument in Markets jumps to
 * Trade, while the Trade quick-switch tabs change symbol in place. */
export function EquitiesScreen(): JSX.Element {
  const [view, setView] = useState<EquitiesView>("markets");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const styles = useThemedStyles(makeStyles);

  function selectFromMarkets(symbol: string): void {
    setSelectedSymbol(symbol);
    setView("trade");
  }

  return (
    <View style={styles.screen} testID="equities-screen">
      <EquitiesNav view={view} onChange={setView} />
      {view === "markets" ? <MarketsView selectedSymbol={selectedSymbol} onSelect={selectFromMarkets} /> : null}
      {view === "trade" ? <TradeView selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} /> : null}
      {view === "blotters" ? <BlottersView /> : null}
    </View>
  );
}

interface EquitiesScreenStyles {
  screen: ViewStyle;
}

function makeStyles(t: RnTheme): EquitiesScreenStyles {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bgPrimary },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/EquitiesNav.test.tsx src/ui/equities/EquitiesScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/equities/EquitiesNav.tsx packages/client-react-native/src/ui/equities/EquitiesNav.test.tsx packages/client-react-native/src/ui/equities/EquitiesScreen.tsx packages/client-react-native/src/ui/equities/EquitiesScreen.test.tsx
git commit -m "feat(rn): equities screen + segmented nav (markets/trade/blotters)"
```

---

### Task 8: Shell integration — Equities tab + Appearance relocation

Register the Equities tab and route; relocate Appearance from the bottom bar to a toolbar gear + absolute-fill overlay (LockScreen pattern); remove the Appearance tab + route.

**Files:**
- Create: `packages/client-react-native/app/equities.tsx`
- Create: `packages/client-react-native/src/ui/shell/appearance/AppearanceButton.tsx`
- Create: `packages/client-react-native/src/ui/shell/appearance/AppearanceButton.test.tsx`
- Create: `packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.tsx`
- Create: `packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.test.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx` (add equities tab; add gear button + overlay + open state; remove appearance tab)
- Delete: `packages/client-react-native/app/appearance.tsx`

**Interfaces:**
- Consumes: `EquitiesScreen` (Task 7); `AppearanceScreen` (existing, `#/ui/AppearanceScreen`); `LockButton`/`LockScreen` patterns.
- Produces: `AppearanceButton` (`{ onPress }`), `AppearanceOverlay` (`{ open, onClose }`).

- [ ] **Step 1: Write the failing tests**

`AppearanceButton.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("invokes onPress when tapped", async () => {
  const onPress = jest.fn();
  await renderWithTheme(<AppearanceButton onPress={onPress} />);
  void fireEvent.press(screen.getByTestId("appearance-button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
```

`AppearanceOverlay.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(): ViewModel {
  return {
    useThemePreference: () => ({ modePreference: "dark", cycle: () => {} }),
    useThemeSkinPreference: () => ({ skin: "holo", setSkin: () => {} }),
  } as unknown as ViewModel;
}

test("renders nothing when closed", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open={false} onClose={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("appearance-overlay")).toBeNull();
});

test("shows the appearance panel when open and closes on request", async () => {
  const onClose = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("appearance-overlay")).toBeTruthy();
  expect(screen.getByTestId("appearance-panel")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("appearance-close"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/appearance`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the shell pieces**

`src/ui/shell/appearance/AppearanceButton.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that opens the Appearance overlay. RN has no header
 * settings menu, so the toolbar carries the control (mirrors `LockButton`). */
export function AppearanceButton({ onPress }: AppearanceButtonProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable testID="appearance-button" accessibilityLabel="Appearance" onPress={onPress}>
      <Text style={styles.label}>Theme</Text>
    </Pressable>
  );
}

interface AppearanceButtonProps {
  onPress: () => void;
}

interface AppearanceButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceButtonStyles {
  return StyleSheet.create({
    label: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
```

`src/ui/shell/appearance/AppearanceOverlay.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen Appearance overlay. Renders nothing when closed; while open it
 * covers the shell — an absolute-fill <View> (NOT an RN Modal: Modal-via-press
 * segfaults under x86 jest) — with a close control above the existing
 * `AppearanceScreen`. zIndex 150 sits below `LockScreen` (200). */
export function AppearanceOverlay({ open, onClose }: AppearanceOverlayProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);
  if (!open) return null;
  return (
    <View testID="appearance-overlay" style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.title}>APPEARANCE</Text>
        <Pressable testID="appearance-close" onPress={onClose}>
          <Text style={styles.close}>CLOSE ✕</Text>
        </Pressable>
      </View>
      <AppearanceScreen />
    </View>
  );
}

interface AppearanceOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface AppearanceOverlayStyles {
  overlay: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  close: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceOverlayStyles {
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 150, elevation: 150, backgroundColor: t.bgPrimary },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    title: { fontSize: 14, letterSpacing: 2, color: t.textPrimary, fontFamily: t.fontDisplay },
    close: { fontSize: 13, color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
```

`app/equities.tsx`:
```tsx
import type { JSX } from "react";

import { EquitiesScreen } from "#/ui/equities/EquitiesScreen";

/** The Equities tab — Markets, Trade and Blotters. Composition, the simulator
 * toggle and the connection banner live one level up in `_layout`. */
export default function EquitiesRoute(): JSX.Element {
  return <EquitiesScreen />;
}
```

- [ ] **Step 4: Run to verify the new-component tests pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/appearance`
Expected: PASS.

- [ ] **Step 5: Wire `_layout.tsx` and remove the Appearance tab/route**

Edit `packages/client-react-native/app/_layout.tsx`:

1. Add imports (after the existing `LockScreen` import line):
```tsx
import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
```

2. In `Chrome`, add open state at the top of the function body (below `const styles = useThemedStyles(makeStyles);`):
```tsx
  const [appearanceOpen, setAppearanceOpen] = useState(false);
```
(`useState` is already imported at the top of the file.)

3. In the `toolbarRight` view, insert the button between the `Switch` and `LockButton`:
```tsx
        <View style={styles.toolbarRight}>
          <Switch value={simulator} onValueChange={onToggle} />
          <AppearanceButton
            onPress={() => {
              setAppearanceOpen(true);
            }}
          />
          <LockButton />
        </View>
```

4. Replace the five `<Tabs.Screen>` lines with (remove `appearance`, add `equities` after `credit`):
```tsx
        <Tabs.Screen name="index" options={{ title: "Rates" }} />
        <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="credit" options={{ title: "Credit" }} />
        <Tabs.Screen name="equities" options={{ title: "Equities" }} />
```

5. Render the overlay just before `<LockScreen />` (last children of the `styles.fill` view):
```tsx
      <AppearanceOverlay
        open={appearanceOpen}
        onClose={() => {
          setAppearanceOpen(false);
        }}
      />
      <LockScreen />
```

6. Delete the route file:
```bash
git rm packages/client-react-native/app/appearance.tsx
```

- [ ] **Step 6: Run the full package test suite + typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`
Expected: PASS — vitest (utils) + jest (all leaves, including the existing `AppearanceScreen.test.tsx`, which renders the component directly and is unaffected by the route removal).

- [ ] **Step 7: Bundle smoke**

Run: `pnpm --filter @rtc/client-react-native export`
Expected: `expo export` succeeds; the exported module count grows by the equities tree (~15 modules).

- [ ] **Step 8: Commit**

```bash
git add packages/client-react-native/app packages/client-react-native/src/ui/shell/appearance
git commit -m "feat(rn): register Equities tab; relocate Appearance to toolbar gear + overlay"
```

---

## Final verification (controller, before PR)

Run the full gauntlet first-hand from the repo root and confirm real exit codes:

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm biome ci
pnpm lint:eslint
pnpm lint:eslint:types
pnpm knip
pnpm --filter @rtc/client-react-native export
```

Then dispatch the **opus whole-branch review** (net for skin-legibility across all 8 skins + jsdom-invisible SVG/paint: candles, gauge arc, sparkline bars, depth bars, heat tints, overlay z-order).

---

## Self-Review

**1. Spec coverage:**
- Three sub-views (Markets/Trade/Blotters) → Tasks 2, 5, 6, 7. ✓
- Reused hooks (all 7) → wired in Tasks 2/3/4/6; no composition change. ✓
- Pure utils (buildCandles/buildGauge/buildSparkline/equityHeat) → Task 1, vitest. ✓
- canvas→react-native-svg (chart, gauge, sparkline) → Tasks 3, 6. ✓
- Appearance relocation (gear + overlay, remove tab/route, LockScreen pattern, non-Modal) → Task 8. ✓
- Tab bar → Rates/Blotter/Analytics/Credit/Equities → Task 8. ✓
- Testing plan (jest leaves + vitest utils + gauntlet + opus review) → per-task + Final verification. ✓
- Non-goals (no deps/domain/bindings/web edits, no live-data change) → honoured; only files under `packages/client-react-native/` are touched. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; every test has real assertions. ✓

**3. Type consistency:** `EquitiesView` used identically in Task 7 nav + screen; `CandleGeom`/`GaugePaths`/`SectorGroup` field names consistent between util (Task 1) and consumers (Tasks 3/6/2); component prop shapes match the Shared interface contract; `useOrderTicket` result shape matches `OrderTicketMachine` (`state` union + intents). Gauge/spark constants (`GAUGE_*`, `SPARK_*`) exported from Task 1 and imported by Task 6. ✓
