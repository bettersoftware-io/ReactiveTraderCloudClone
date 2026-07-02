# P4 Equities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Equities trading surface of `@rtc/client-prototype` — a 4-panel dock (candlestick chart, Orders/Positions blotter, order ticket, watchlist) with a live-walking price engine — as a self-contained `src/equities/` module wired into the `equities` nav tab.

**Architecture:** A new `src/equities/` feature module mirroring `src/credit/` (P3): dumb CSS-Modules components + co-located mock hooks + seed data. It reuses the shared `src/layout/` primitives (`Panel`, `SplitHandle`, `useSplit`, `useMaxPanel`) and `src/motion/useFlip` **as-is** (no changes to shared code). The price engine (`useEquities`) mirrors `useFxRates`; positions are **derived** from filled orders by a pure function; the candlestick chart is **faithful div-based** (wick + body per candle, geometry via `--custom-property` style objects).

**Tech Stack:** React 19, TypeScript, Vite, CSS Modules, native WAAPI, Vitest + @testing-library/react. No `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no ViewModel seam, no React Compiler.

**Spec:** `docs/superpowers/specs/2026-07-02-client-prototype-p4-equities.md`
**Prototype source:** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (Equities markup ~596–685; logic `selectEq`/`closeEqTab`/`setTf`/`cycleWlSort`/`ticketSet`/`ticketQtyStep`/`submitOrder`; VM builders `watchlist`/`inst`/`chartCandles`/`chartGrid`/`chartLabels`/`ticket`/`eqOrders`/`eqPositions`; `eqMeta`/`genCandles` seed).
**Reference files to mirror (already on `main`):** `src/credit/creditData.ts`, `src/fx/useFxRates.ts`, `src/credit/useCreditForm.ts`, `src/credit/rfqCardVm.ts`, `src/credit/Blotter/CreditBlotterPanel.tsx` (+`.module.css`), `src/fx/FxScreen.tsx` (+`.module.css`), `src/credit/CreditScreen.tsx` (+`.module.css`), `src/credit/useCreditDock.ts`, `src/layout/{Panel,SplitHandle,useSplit,useMaxPanel}.ts(x)`, `src/mock/rng.ts`, `tests/credit-rfqs.test.ts`, `tests/fx-blotter.test.tsx`.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Package self-containment:** no `@rtc/domain` / `@rtc/shared`, no RxJS, no machines, no ViewModel seam, no React Compiler. `equities/` imports **nothing** from `fx/` or `credit/` (and vice-versa); shared code lives in `src/layout/`, `src/motion/`, `src/mock/`.
- **CSS-Modules taxonomy:** static → class; semantic state → `data-*` (stringify with `String(bool)` — never inline colour strings); runtime geometry → a **named-const** `style={x}` object typed `as CSSProperties` that sets only a `--custom-property`. No `eslint-disable` anywhere.
- **Render purity (StrictMode):** the seeded RNG lives in a `useRef` and is never resynced; RNG and persistence never run inside a `setState` updater **nor inside a `useState`/`useMemo` initializer** — StrictMode double-invokes both, drawing the RNG twice. To seed rng-dependent initial state, use a **render-body ref-lazy-init** (`const seedRef = useRef<T | null>(null); if (seedRef.current === null) { seedRef.current = seed(rngRef.current); } const [x, setX] = useState(seedRef.current);`) — the ref persists across StrictMode's double render, so `seed()` runs exactly once. Compute updater values *outside* the updater and pass them in. All `setTimeout`/`setInterval` ids are tracked in a `useRef<Set<…>>` and cleared on unmount.
- **Lint/format rules that have bitten prior phases:** `arrow-body-style: always` (every arrow, including `.map`/`.find` callbacks — always `=> { return … }`); module-level functions are `function` declarations (not arrow consts); `rtc/newspaper-order` (types/helpers/`vi.mock` go **below** the `describe`); `rtc/component-newspaper` (the exported component is the file's lede, filename matches it); `useUniqueElementIds` (any element/SVG `id` uses `useId()`; logical panel-id props use a **bottom `const`** var, not an inline string literal); `useExplicitType` (a `const` whose initializer isn't literal-inferrable gets an explicit type annotation).
- **The gate for every task (all must pass before commit):**
  - `pnpm --filter @rtc/client-prototype typecheck`
  - `pnpm --filter @rtc/client-prototype test`
  - `pnpm exec eslint packages/client-prototype`
  - `pnpm exec stylelint "packages/client-prototype/src/**/*.css"`
  - `pnpm exec biome ci packages/client-prototype`  ← format + lint; eslint alone misses format diffs, `useUniqueElementIds`, `useExplicitType`. Auto-fix with `pnpm exec biome check --write packages/client-prototype` then re-run.
  - CI also runs repo-wide `pnpm lint:dead` (knip), `pnpm check:deps`, `pnpm check:versions`, `pnpm test:rules` — keep every `export` consumed (drop `export` on structurally-only types), no cross-feature imports.
- **Never `git add .`** — stage only the exact files named in each task's commit step (no `.superpowers/`, `.idea/`, `.env.local`, scratch).
- **Run a single test file** with: `pnpm --filter @rtc/client-prototype exec vitest run <name>` (e.g. `equities-engine`).

---

### Task 1: Equities types + data module

**Files:**
- Create: `packages/client-prototype/src/equities/types.ts`
- Create: `packages/client-prototype/src/equities/equitiesData.ts`
- Test: `packages/client-prototype/tests/equities-data.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - Types: `EqSym`, `Timeframe`, `OrderSide`, `OrderType`, `OrderStatus`, `WlSort`, `Candle`, `EqMeta`, `EqOrder`, `EqPosition`, `EqTicket`.
  - `EQ_META: Record<EqSym, EqMeta>`, `EQ_SYMS: EqSym[]`, `EQ_SEQ_START = 5001`, `ORDER_CAP = 40`.
  - `fmtNum(n: number): string`, `genCandles(sym: EqSym, tf: Timeframe, rng: () => number): Candle[]`, `seedVols(rng: () => number): Record<EqSym, string>`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/equities-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { EQ_META, EQ_SYMS, genCandles, seedVols } from "#/equities/equitiesData";
import { mulberry32 } from "#/mock/rng";

describe("equitiesData", () => {
  test("EQ_META has 8 symbols with AAPL first at 229.35", () => {
    expect(EQ_SYMS).toHaveLength(8);
    expect(EQ_SYMS[0]).toBe("AAPL");
    expect(EQ_META.AAPL.px).toBe(229.35);
    expect(EQ_META.SPY.exch).toBe("NYSE ARCA");
  });

  test("genCandles is deterministic under a seeded rng and honours bar counts", () => {
    const a = genCandles("AAPL", "1D", mulberry32(7));
    const b = genCandles("AAPL", "1D", mulberry32(7));
    expect(a).toHaveLength(40);
    expect(genCandles("AAPL", "3M", mulberry32(7))).toHaveLength(52);
    expect(a).toEqual(b);
    for (const candle of a) {
      expect(candle.h).toBeGreaterThanOrEqual(Math.max(candle.o, candle.c));
      expect(candle.l).toBeLessThanOrEqual(Math.min(candle.o, candle.c));
    }
  });

  test("seedVols yields one stable M-suffixed string per symbol", () => {
    const vols = seedVols(mulberry32(1));
    expect(Object.keys(vols)).toHaveLength(8);
    expect(vols.AAPL).toMatch(/^\d\.\dM$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run equities-data`
Expected: FAIL — cannot resolve `#/equities/equitiesData`.

- [ ] **Step 3: Write `types.ts`**

`packages/client-prototype/src/equities/types.ts`:

```ts
export type EqSym =
  | "AAPL"
  | "MSFT"
  | "NVDA"
  | "TSLA"
  | "AMZN"
  | "GOOGL"
  | "META"
  | "SPY";

export type Timeframe = "1D" | "1W" | "1M" | "3M";
export type OrderSide = "Buy" | "Sell";
export type OrderType = "Market" | "Limit";
export type OrderStatus = "Filled" | "Working";
export type WlSort = "sym" | "chg" | "price";

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface EqMeta {
  name: string;
  exch: string;
  px: number;
}

export interface EqOrder {
  id: number;
  time: string;
  sym: EqSym;
  side: OrderSide;
  type: OrderType;
  qty: number;
  price: number;
  status: OrderStatus;
}

export interface EqPosition {
  sym: EqSym;
  qty: string;
  avg: string;
  last: string;
  mv: string;
  pl: string;
  plColor: string;
}

export interface EqTicket {
  side: OrderSide;
  type: OrderType;
  qty: string;
  limit: string;
}
```

- [ ] **Step 4: Write `equitiesData.ts`**

`packages/client-prototype/src/equities/equitiesData.ts`:

```ts
import type { Candle, EqMeta, EqSym, Timeframe } from "#/equities/types";

export const EQ_SEQ_START = 5001;
export const ORDER_CAP = 40;

// PROTO L764-768: the 8 seeded equities (price is the seed last).
export const EQ_META: Record<EqSym, EqMeta> = {
  AAPL: { name: "Apple Inc", exch: "NASDAQ", px: 229.35 },
  MSFT: { name: "Microsoft Corp", exch: "NASDAQ", px: 467.12 },
  NVDA: { name: "NVIDIA Corp", exch: "NASDAQ", px: 131.26 },
  TSLA: { name: "Tesla Inc", exch: "NASDAQ", px: 251.44 },
  AMZN: { name: "Amazon.com", exch: "NASDAQ", px: 218.07 },
  GOOGL: { name: "Alphabet Inc", exch: "NASDAQ", px: 178.53 },
  META: { name: "Meta Platforms", exch: "NASDAQ", px: 591.8 },
  SPY: { name: "S&P 500 ETF", exch: "NYSE ARCA", px: 588.21 },
};

export const EQ_SYMS: EqSym[] = Object.keys(EQ_META) as EqSym[];

interface TfConfig {
  bars: number;
  vol: number;
}

// PROTO L839 genCandles cfg: [bars, volatility] per timeframe.
const TF_CONFIG: Record<Timeframe, TfConfig> = {
  "1D": { bars: 40, vol: 0.004 },
  "1W": { bars: 44, vol: 0.009 },
  "1M": { bars: 48, vol: 0.016 },
  "3M": { bars: 52, vol: 0.03 },
};

// Local formatter (Equities stays self-contained — no import from fx/ or credit/).
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// PROTO L839: a synthetic OHLC series. Starts vol*6 below the seed price and
// random-walks `bars` candles. Pure — the RNG is injected so smokes are
// deterministic and the series is generated outside any setState updater.
export function genCandles(
  sym: EqSym,
  tf: Timeframe,
  rng: () => number,
): Candle[] {
  const { bars, vol } = TF_CONFIG[tf];
  const out: Candle[] = [];
  let px = EQ_META[sym].px * (1 - vol * 6);

  for (let i = 0; i < bars; i += 1) {
    const o = px;
    const c = o * (1 + (rng() - 0.48) * vol * 2);
    const h = Math.max(o, c) * (1 + rng() * vol);
    const l = Math.min(o, c) * (1 - rng() * vol);
    out.push({ o, h, l, c });
    px = c;
  }

  return out;
}

// PROTO L1338 inst.vol: `(2.4 + rng()*0.2)M`. The prototype recomputes this with
// Math.random() on every render (visible jitter); here it is drawn once per
// symbol from the seeded RNG and held stable (spec §3 deliberate deviation).
export function seedVols(rng: () => number): Record<EqSym, string> {
  const vols = {} as Record<EqSym, string>;

  for (const sym of EQ_SYMS) {
    vols[sym] = `${(2.4 + rng() * 0.2).toFixed(1)}M`;
  }

  return vols;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run equities-data`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full task gate** (typecheck · test · eslint · stylelint · biome ci — see Global Constraints). All green.

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/equities/types.ts \
        packages/client-prototype/src/equities/equitiesData.ts \
        packages/client-prototype/tests/equities-data.test.ts
git commit -m "feat(client-prototype): P4 Task 1 — equities types + data module"
```

---

### Task 2: `useEquities` — the price engine

**Files:**
- Create: `packages/client-prototype/src/equities/useEquities.ts`
- Test: `packages/client-prototype/tests/equities-engine.test.ts`

**Interfaces:**
- Consumes: `EQ_META`, `EQ_SYMS`, `seedVols` (Task 1); `EqSym` type.
- Produces:
  - `interface EquitiesApi { rates: Record<EqSym, number>; prev: Record<EqSym, number>; flash: Record<EqSym, FlashEvent>; vol: Record<EqSym, string>; }`
  - `interface FlashEvent { dir: 1 | -1; ts: number; }` (exported).
  - `interface UseEquitiesOptions { rng?: () => number; intervalMs?: number; }`
  - `function useEquities(opts?: UseEquitiesOptions): EquitiesApi`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/equities-engine.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EQ_META } from "#/equities/equitiesData";
import { useEquities } from "#/equities/useEquities";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEquities", () => {
  test("seeds all 8 rates at their meta price with stable vols", () => {
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(3) });
    });
    expect(result.current.rates.AAPL).toBe(EQ_META.AAPL.px);
    expect(result.current.vol.AAPL).toMatch(/M$/);
  });

  test("a tick walks rates, sets a signed flash, and keeps vol stable", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(3), intervalMs: 100 });
    });
    const vol0 = result.current.vol.AAPL;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.rates.AAPL).not.toBe(EQ_META.AAPL.px);
    expect([1, -1]).toContain(result.current.flash.AAPL.dir);
    expect(result.current.flash.AAPL.ts).toBeGreaterThan(0);
    expect(result.current.vol.AAPL).toBe(vol0);
  });

  test("prev smooths toward the walked rate rather than jumping to it", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(9), intervalMs: 100 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.prev.AAPL).not.toBe(result.current.rates.AAPL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run equities-engine`
Expected: FAIL — cannot resolve `#/equities/useEquities`.

- [ ] **Step 3: Write `useEquities.ts`** (mirrors `src/fx/useFxRates.ts` discipline: `rngRef`, pure `walkTick`, tracked interval)

`packages/client-prototype/src/equities/useEquities.ts`:

```ts
import { useEffect, useRef, useState } from "react";

import { EQ_META, EQ_SYMS, seedVols } from "#/equities/equitiesData";
import type { EqSym } from "#/equities/types";

const DEFAULT_INTERVAL_MS = 850;
const WALK_FACTOR = 0.0016;
const PREV_SMOOTH = 0.12;
const PREV_SEED_SPAN = 0.02;
const PREV_SEED_BIAS = 0.4;

export interface FlashEvent {
  dir: 1 | -1;
  ts: number;
}

export interface EquitiesApi {
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
}

export interface UseEquitiesOptions {
  rng?: () => number;
  intervalMs?: number;
}

type WalkState = Pick<EquitiesApi, "rates" | "prev" | "flash">;

// PROTO L807: rates seed at the meta price; prev seeds slightly off so the
// opening %-change is non-zero.
function seedWalk(rng: () => number): WalkState {
  const rates = {} as Record<EqSym, number>;
  const prev = {} as Record<EqSym, number>;
  const flash = {} as Record<EqSym, FlashEvent>;

  for (const sym of EQ_SYMS) {
    const px = EQ_META[sym].px;
    rates[sym] = px;
    prev[sym] = px * (1 - (rng() - PREV_SEED_BIAS) * PREV_SEED_SPAN);
    flash[sym] = { dir: 1, ts: 0 };
  }

  return { rates, prev, flash };
}

// PROTO L1134: per tick each rate walks by ±0.08%, prev eases 12% toward it,
// and the flash records the tick direction with a fresh timestamp.
function walkTick(state: WalkState, rng: () => number): WalkState {
  const rates = {} as Record<EqSym, number>;
  const prev = {} as Record<EqSym, number>;
  const flash = {} as Record<EqSym, FlashEvent>;
  const ts = Date.now();

  for (const sym of EQ_SYMS) {
    const rate = state.rates[sym];
    const dlt = rate * (rng() - 0.5) * WALK_FACTOR;
    const nv = +(rate + dlt).toFixed(2);
    const dir: 1 | -1 = dlt >= 0 ? 1 : -1;

    rates[sym] = nv;
    prev[sym] = state.prev[sym] + (nv - state.prev[sym]) * PREV_SMOOTH;
    flash[sym] = { dir, ts };
  }

  return { rates, prev, flash };
}

export function useEquities(opts: UseEquitiesOptions = {}): EquitiesApi {
  const { rng = Math.random, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const [walk, setWalk] = useState<WalkState>(() => {
    return seedWalk(rngRef.current);
  });
  const [vol] = useState<Record<EqSym, string>>(() => {
    return seedVols(rngRef.current);
  });

  useEffect(() => {
    const id = setInterval(() => {
      setWalk((prev) => {
        return walkTick(prev, rngRef.current);
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return { rates: walk.rates, prev: walk.prev, flash: walk.flash, vol };
}
```

Note: `walkTick` reads `rngRef.current` passed in from the interval callback — the RNG is consumed *outside* the returned-object construction inside a pure function, and `setWalk`'s updater only maps prev→next without calling `rng` in a way that re-runs unequally under StrictMode (the interval fires once per real timer, not per commit; this is exactly `useFxRates`'s pattern).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run equities-engine`
Expected: PASS (3 tests).

- [ ] **Step 5: Task gate** (all green).

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/equities/useEquities.ts \
        packages/client-prototype/tests/equities-engine.test.ts
git commit -m "feat(client-prototype): P4 Task 2 — useEquities price engine"
```

---

### Task 3: `useEqChart` — selection, tabs, timeframe, sort

**Files:**
- Create: `packages/client-prototype/src/equities/useEqChart.ts`
- Test: `packages/client-prototype/tests/eq-chart-hook.test.ts`

**Interfaces:**
- Consumes: `genCandles` (Task 1); `Candle`, `EqSym`, `Timeframe`, `WlSort`.
- Produces:
  - `interface EqChartApi { sel: EqSym; openTabs: EqSym[]; tf: Timeframe; wlSort: WlSort; series: Candle[]; selectEq(sym: EqSym): void; closeTab(sym: EqSym): void; setTf(tf: Timeframe): void; cycleWlSort(): void; }`
  - `interface UseEqChartOptions { rng?: () => number; }`
  - `function useEqChart(opts?: UseEqChartOptions): EqChartApi`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/eq-chart-hook.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useEqChart } from "#/equities/useEqChart";
import { mulberry32 } from "#/mock/rng";

afterEach(cleanup);

describe("useEqChart", () => {
  test("starts on AAPL / 1D with one tab and a 40-bar series", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    expect(result.current.sel).toBe("AAPL");
    expect(result.current.openTabs).toEqual(["AAPL"]);
    expect(result.current.tf).toBe("1D");
    expect(result.current.series).toHaveLength(40);
    expect(result.current.wlSort).toBe("chg");
  });

  test("selectEq adds a tab and switches the selection", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.selectEq("MSFT");
    });
    expect(result.current.sel).toBe("MSFT");
    expect(result.current.openTabs).toEqual(["AAPL", "MSFT"]);
  });

  test("closing the selected tab falls back to the last remaining tab", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.selectEq("MSFT");
    });
    act(() => {
      result.current.closeTab("MSFT");
    });
    expect(result.current.openTabs).toEqual(["AAPL"]);
    expect(result.current.sel).toBe("AAPL");
  });

  test("setTf regenerates the selected series to the new bar count", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.setTf("3M");
    });
    expect(result.current.tf).toBe("3M");
    expect(result.current.series).toHaveLength(52);
  });

  test("cycleWlSort cycles chg -> price -> sym -> chg", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("price");
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("sym");
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("chg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-chart-hook`
Expected: FAIL — cannot resolve `#/equities/useEqChart`.

- [ ] **Step 3: Write `useEqChart.ts`**

Key discipline: the seeded RNG lives in a `useRef`; candle generation runs **outside** the `setState` updater (compute `gen` first, then `setSeriesMap(prev => …gen…)`); `selRef`/`tfRef`/`openTabsRef`/`seriesRef` mirror state so the stable callbacks read live values (the `useSplit` `ratioRef` pattern).

`packages/client-prototype/src/equities/useEqChart.ts`:

```ts
import { useCallback, useRef, useState } from "react";

import { genCandles } from "#/equities/equitiesData";
import type { Candle, EqSym, Timeframe, WlSort } from "#/equities/types";

const INITIAL_SYM: EqSym = "AAPL";
const INITIAL_TF: Timeframe = "1D";
const WL_ORDER: WlSort[] = ["sym", "chg", "price"];

export interface EqChartApi {
  sel: EqSym;
  openTabs: EqSym[];
  tf: Timeframe;
  wlSort: WlSort;
  series: Candle[];
  selectEq(sym: EqSym): void;
  closeTab(sym: EqSym): void;
  setTf(tf: Timeframe): void;
  cycleWlSort(): void;
}

export interface UseEqChartOptions {
  rng?: () => number;
}

export function useEqChart(opts: UseEqChartOptions = {}): EqChartApi {
  const { rng = Math.random } = opts;
  const rngRef = useRef(rng);

  const [sel, setSel] = useState<EqSym>(INITIAL_SYM);
  const [openTabs, setOpenTabs] = useState<EqSym[]>([INITIAL_SYM]);
  const [tf, setTfState] = useState<Timeframe>(INITIAL_TF);
  const [wlSort, setWlSort] = useState<WlSort>("chg");

  // Seed the initial series via a render-body ref-lazy-init, NOT a useState
  // initializer (StrictMode double-invokes initializers, drawing the RNG
  // twice). The ref persists across the double render, so genCandles runs once.
  const seedRef = useRef<Record<string, Candle[]> | null>(null);

  if (seedRef.current === null) {
    seedRef.current = {
      [INITIAL_SYM]: genCandles(INITIAL_SYM, INITIAL_TF, rngRef.current),
    };
  }

  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>(
    seedRef.current,
  );

  const selRef = useRef(sel);
  selRef.current = sel;
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const seriesRef = useRef(seriesMap);
  seriesRef.current = seriesMap;

  const selectEq = useCallback((sym: EqSym) => {
    setSel(sym);
    setOpenTabs((prev) => {
      return prev.includes(sym) ? prev : [...prev, sym];
    });

    if (seriesRef.current[sym] == null) {
      const gen = genCandles(sym, tfRef.current, rngRef.current);
      setSeriesMap((prev) => {
        return { ...prev, [sym]: gen };
      });
    }
  }, []);

  const closeTab = useCallback((sym: EqSym) => {
    const remaining = openTabsRef.current.filter((t) => {
      return t !== sym;
    });

    if (remaining.length === 0) {
      return;
    }

    setOpenTabs(remaining);
    setSel((prev) => {
      return prev === sym ? remaining[remaining.length - 1] : prev;
    });
  }, []);

  const setTf = useCallback((next: Timeframe) => {
    const gen = genCandles(selRef.current, next, rngRef.current);
    setTfState(next);
    setSeriesMap((prev) => {
      return { ...prev, [selRef.current]: gen };
    });
  }, []);

  const cycleWlSort = useCallback(() => {
    setWlSort((prev) => {
      return WL_ORDER[(WL_ORDER.indexOf(prev) + 1) % WL_ORDER.length];
    });
  }, []);

  const series: Candle[] = seriesMap[sel] ?? [];

  return {
    sel,
    openTabs,
    tf,
    wlSort,
    series,
    selectEq,
    closeTab,
    setTf,
    cycleWlSort,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-chart-hook`
Expected: PASS (5 tests).

- [ ] **Step 5: Task gate** (all green).

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/equities/useEqChart.ts \
        packages/client-prototype/tests/eq-chart-hook.test.ts
git commit -m "feat(client-prototype): P4 Task 3 — useEqChart selection/tabs/tf/sort"
```

---

### Task 4: Pure view-models — `chartVm` + `watchlistVm`

**Files:**
- Create: `packages/client-prototype/src/equities/chartVm.ts`
- Create: `packages/client-prototype/src/equities/watchlistVm.ts`
- Test: `packages/client-prototype/tests/chart-vm.test.ts`

**Interfaces:**
- Consumes: `EQ_META`, `fmtNum` (Task 1); `useEquities`'s `FlashEvent` shape (re-declared locally as a param type — do **not** import from the hook to keep VMs pure/leaf); `Candle`, `EqSym`, `WlSort` types.
- Produces:
  - `chartVm.ts`: `interface CandleVm { key: number; up: boolean; style: CSSProperties; wickStyle: CSSProperties; }`, `interface GridLineVm { key: number; style: CSSProperties; }`, `interface PriceLabelVm { key: number; txt: string; style: CSSProperties; }`, `interface ChartVm { candles: CandleVm[]; grid: GridLineVm[]; labels: PriceLabelVm[]; }`, and `function chartVm(series: Candle[], liveRate: number, flashOn: boolean): ChartVm`.
  - `watchlistVm.ts`: `interface WatchRowVm { sym: EqSym; name: string; last: string; chg: string; up: boolean; selected: boolean; flashOn: boolean; }`, and `function watchlistVm(input: WatchlistInput): WatchRowVm[]` where `interface WatchlistInput { rates: Record<EqSym, number>; prev: Record<EqSym, number>; flash: Record<EqSym, { dir: 1 | -1; ts: number }>; sel: EqSym; wlSort: WlSort; now: number; }`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/chart-vm.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { chartVm } from "#/equities/chartVm";
import { genCandles } from "#/equities/equitiesData";
import { watchlistVm } from "#/equities/watchlistVm";
import { mulberry32 } from "#/mock/rng";
import type { EqSym } from "#/equities/types";

describe("chartVm", () => {
  test("emits one candle vm per bar, 4 grid lines and 4 price labels", () => {
    const series = genCandles("AAPL", "1D", mulberry32(2));
    const vm = chartVm(series, series[series.length - 1].c, false);
    expect(vm.candles).toHaveLength(40);
    expect(vm.grid).toHaveLength(4);
    expect(vm.labels).toHaveLength(4);
  });

  test("a live rate above the series high lifts the top price label", () => {
    const series = genCandles("AAPL", "1D", mulberry32(2));
    const high = Math.max(...series.map((c) => {
      return c.h;
    }));
    const normal = chartVm(series, series[series.length - 1].c, false);
    const spiked = chartVm(series, high + 5, false);
    // The top label is cmax - 0.12*crng; pushing the live last candle above
    // every high raises cmax, so that label rises too.
    expect(Number.parseFloat(spiked.labels[0].txt)).toBeGreaterThan(
      Number.parseFloat(normal.labels[0].txt),
    );
  });
});

describe("watchlistVm", () => {
  test("sorts by descending %-change and flags the selected row", () => {
    const rates: Record<EqSym, number> = {
      AAPL: 101, MSFT: 200, NVDA: 100, TSLA: 100,
      AMZN: 100, GOOGL: 100, META: 100, SPY: 100,
    };
    const prev: Record<EqSym, number> = {
      AAPL: 100, MSFT: 100, NVDA: 100, TSLA: 100,
      AMZN: 100, GOOGL: 100, META: 100, SPY: 100,
    };
    const flash = {} as WatchInput["flash"];
    for (const sym of Object.keys(rates) as EqSym[]) {
      flash[sym] = { dir: 1, ts: 0 };
    }
    const rows = watchlistVm({ rates, prev, flash, sel: "AAPL", wlSort: "chg", now: 10_000 });
    expect(rows[0].sym).toBe("MSFT");
    expect(rows.find((r) => {
      return r.sym === "AAPL";
    })?.selected).toBe(true);
  });
});

type WatchInput = Parameters<typeof watchlistVm>[0];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run chart-vm`
Expected: FAIL — cannot resolve `#/equities/chartVm`.

- [ ] **Step 3: Write `chartVm.ts`** (PROTO L1339-1345 geometry, verbatim math)

`packages/client-prototype/src/equities/chartVm.ts`:

```ts
import type { CSSProperties } from "react";

import type { Candle } from "#/equities/types";

const Y_SPAN = 86;
const Y_TOP = 6;
const BODY_FRAC = 0.64;
const HALF_BODY_FRAC = 0.32;
const MIN_BODY = 0.6;
const GRID_FRACTIONS = [0.2, 0.4, 0.6, 0.8];
const LABEL_FRACTIONS = [0.12, 0.37, 0.62, 0.87];

export interface CandleVm {
  key: number;
  up: boolean;
  style: CSSProperties;
  wickStyle: CSSProperties;
}

export interface GridLineVm {
  key: number;
  style: CSSProperties;
}

export interface PriceLabelVm {
  key: number;
  txt: string;
  style: CSSProperties;
}

export interface ChartVm {
  candles: CandleVm[];
  grid: GridLineVm[];
  labels: PriceLabelVm[];
}

interface LiveCandle {
  o: number;
  h: number;
  l: number;
  c: number;
}

// The stored series is immutable; the last candle is overlaid with the live
// price at render (spec §3): close = rate, high/low stretch to include it.
function withLiveLast(series: Candle[], liveRate: number): LiveCandle[] {
  return series.map((cd, i) => {
    if (i !== series.length - 1) {
      return cd;
    }

    return {
      o: cd.o,
      c: liveRate,
      h: Math.max(cd.h, liveRate),
      l: Math.min(cd.l, liveRate),
    };
  });
}

// PROTO L1343-1345: y maps a price into [6%, 92%] of the plot, inverted (high
// at the top); each candle body is 64% of a column wide, its wick 1px.
export function chartVm(
  series: Candle[],
  liveRate: number,
  flashOn: boolean,
): ChartVm {
  const candlesIn = withLiveLast(series, liveRate);
  const cmin = Math.min(...candlesIn.map((c) => {
    return c.l;
  }));
  const cmax = Math.max(...candlesIn.map((c) => {
    return c.h;
  }));
  const crng = cmax - cmin || 1;
  const n = candlesIn.length;
  const cw = 100 / n;
  const yPct = (p: number): number => {
    return ((cmax - p) / crng) * Y_SPAN + Y_TOP;
  };

  const candles: CandleVm[] = candlesIn.map((cd, i) => {
    const x = (i + 0.5) * cw;
    const up = cd.c >= cd.o;
    const yo = yPct(cd.o);
    const yc = yPct(cd.c);
    const top = Math.min(yo, yc);
    const bodyH = Math.max(MIN_BODY, Math.abs(yo - yc));
    const isLast = i === n - 1;
    const style = {
      "--x": `${x}%`,
      "--top": `${top}%`,
      "--h": `${bodyH}%`,
      "--w": `${cw * BODY_FRAC}%`,
      "--wleft-offset": `${cw * HALF_BODY_FRAC}%`,
      "--glow": isLast && flashOn ? "1" : "0",
    } as CSSProperties;
    const wickStyle = {
      "--wx": `calc(${x}% - 0.5px)`,
      "--wtop": `${yPct(cd.h)}%`,
      "--wh": `${yPct(cd.l) - yPct(cd.h)}%`,
    } as CSSProperties;

    return { key: i, up, style, wickStyle };
  });

  const grid: GridLineVm[] = GRID_FRACTIONS.map((f, i) => {
    return { key: i, style: { "--gtop": `${f * 100}%` } as CSSProperties };
  });

  const labels: PriceLabelVm[] = LABEL_FRACTIONS.map((f, i) => {
    return {
      key: i,
      txt: (cmax - f * crng).toFixed(2),
      style: { "--ltop": `calc(${f * 100}% - 6px)` } as CSSProperties,
    };
  });

  return { candles, grid, labels };
}
```

- [ ] **Step 4: Write `watchlistVm.ts`** (PROTO L1337 rows + sort)

`packages/client-prototype/src/equities/watchlistVm.ts`:

```ts
import { EQ_META, EQ_SYMS } from "#/equities/equitiesData";
import type { EqSym, WlSort } from "#/equities/types";

const FLASH_MS = 650;

interface FlashEvent {
  dir: 1 | -1;
  ts: number;
}

export interface WatchlistInput {
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  sel: EqSym;
  wlSort: WlSort;
  now: number;
}

export interface WatchRowVm {
  sym: EqSym;
  name: string;
  last: string;
  chg: string;
  up: boolean;
  selected: boolean;
  flashOn: boolean;
}

interface RankedRow extends WatchRowVm {
  lastN: number;
  chgN: number;
}

// PROTO L1337: one row per symbol, %-change vs the smoothed prev, a brief
// tick flash, then sorted by the active mode (A-Z / %chg desc / price desc).
export function watchlistVm(input: WatchlistInput): WatchRowVm[] {
  const { rates, prev, flash, sel, wlSort, now } = input;

  const rows: RankedRow[] = EQ_SYMS.map((sym) => {
    const last = rates[sym];
    const chgPct = ((last - prev[sym]) / prev[sym]) * 100;
    const up = chgPct >= 0;
    const fl = flash[sym];
    const flashOn = fl != null && now - fl.ts < FLASH_MS;

    return {
      sym,
      name: EQ_META[sym].name,
      last: last.toFixed(2),
      chg: `${up ? "+" : ""}${chgPct.toFixed(2)}%`,
      up,
      selected: sym === sel,
      flashOn,
      lastN: last,
      chgN: chgPct,
    };
  });

  if (wlSort === "chg") {
    rows.sort((a, b) => {
      return b.chgN - a.chgN;
    });
  } else if (wlSort === "price") {
    rows.sort((a, b) => {
      return b.lastN - a.lastN;
    });
  }

  return rows.map((r) => {
    return {
      sym: r.sym,
      name: r.name,
      last: r.last,
      chg: r.chg,
      up: r.up,
      selected: r.selected,
      flashOn: r.flashOn,
    };
  });
}
```

(`wlSort === "sym"` keeps `EQ_SYMS` insertion order — already alphabetical enough for the fixture; the prototype's A-Z is that natural key order.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run chart-vm`
Expected: PASS (4 tests).

- [ ] **Step 6: Task gate** (all green).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/equities/chartVm.ts \
        packages/client-prototype/src/equities/watchlistVm.ts \
        packages/client-prototype/tests/chart-vm.test.ts
git commit -m "feat(client-prototype): P4 Task 4 — chartVm + watchlistVm"
```

---

### Task 5: Chart panel

**Files:**
- Create: `packages/client-prototype/src/equities/Chart/ChartPanel.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Chart/InstrumentTabs.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Chart/InstrumentHeader.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Chart/CandleChart.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Chart/CandleBars.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Chart/TimeframePills.tsx` (+ `.module.css`)
- Test: `packages/client-prototype/tests/eq-chart.test.tsx`

**Interfaces:**
- Consumes: `EQ_META` (Task 1); `EqChartApi` (Task 3); `chartVm`/`ChartVm` (Task 4); `EquitiesApi` (Task 2); `EqSym`/`Timeframe`.
- Produces:
  - `ChartPanel` props: `interface ChartPanelProps { chart: EqChartApi; rates: Record<EqSym, number>; prev: Record<EqSym, number>; flash: Record<EqSym, FlashEvent>; vol: Record<EqSym, string>; }`. `ChartPanel` renders `InstrumentTabs` + `TimeframePills` in a control sub-head (the outer dock `Panel`'s head/maximize come from Task 9), then `InstrumentHeader` over `CandleChart`.
  - `InstrumentTabs` props: `{ tabs: EqSym[]; sel: EqSym; onSelect(sym): void; onClose(sym): void; }`.
  - `TimeframePills` props: `{ tf: Timeframe; onSet(tf): void; }`.
  - `InstrumentHeader` props: `{ sym: EqSym; last: number; prev: number; flashOn: boolean; flashDir: 1 | -1; seriesHigh: number; seriesLow: number; vol: string; }`.
  - `CandleChart` props: `{ vm: ChartVm; }`; `CandleBars` props: `{ candles: ChartVm["candles"]; }`.

Because these are presentational, the reviewer's spec check for this task focuses on: markup matches PROTO L599-624, geometry goes through the `--custom-property` hatch (no inline colour strings), and the flash uses `data-*` + existing keyframes. The full JSX/CSS is given below.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/eq-chart.test.tsx`:

```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ChartPanel } from "#/equities/Chart/ChartPanel";
import { useEqChart } from "#/equities/useEqChart";
import { useEquities } from "#/equities/useEquities";
import { mulberry32 } from "#/mock/rng";

afterEach(cleanup);

function renderChart() {
  const chart = renderHook(() => {
    return useEqChart({ rng: mulberry32(1) });
  }).result.current;
  const eng = renderHook(() => {
    return useEquities({ rng: mulberry32(1) });
  }).result.current;

  return render(
    <ChartPanel
      chart={chart}
      rates={eng.rates}
      prev={eng.prev}
      flash={eng.flash}
      vol={eng.vol}
    />,
  );
}

describe("ChartPanel", () => {
  test("renders the selected symbol, one tab, 4 timeframe pills and 40 candles", () => {
    const { container, getAllByText } = renderChart();
    expect(getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-tf]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-candle]')).toHaveLength(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-chart`
Expected: FAIL — cannot resolve `#/equities/Chart/ChartPanel`.

- [ ] **Step 3: Write the six components + CSS**

`packages/client-prototype/src/equities/Chart/InstrumentTabs.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Chart/InstrumentTabs.module.css";
import type { EqSym } from "#/equities/types";

export interface InstrumentTabsProps {
  tabs: EqSym[];
  sel: EqSym;
  onSelect(sym: EqSym): void;
  onClose(sym: EqSym): void;
}

// PROTO L601: the open-instrument tab strip, each tab an active/idle symbol
// with a close affordance.
export function InstrumentTabs(props: InstrumentTabsProps): ReactElement {
  const { tabs, sel, onSelect, onClose } = props;

  return (
    <div className={styles.tabs}>
      {tabs.map((sym) => {
        return (
          <InstrumentTab
            key={sym}
            sym={sym}
            active={sym === sel}
            onSelect={onSelect}
            onClose={onClose}
          />
        );
      })}
    </div>
  );
}

interface InstrumentTabProps {
  sym: EqSym;
  active: boolean;
  onSelect(sym: EqSym): void;
  onClose(sym: EqSym): void;
}

function InstrumentTab(props: InstrumentTabProps): ReactElement {
  const { sym, active, onSelect, onClose } = props;

  function handleSelect(): void {
    onSelect(sym);
  }

  function handleClose(e: React.MouseEvent): void {
    e.stopPropagation();
    onClose(sym);
  }

  return (
    <button
      type="button"
      className={styles.tab}
      data-active={String(active)}
      onClick={handleSelect}
    >
      {sym}
      <span className={styles.close} onClick={handleClose} aria-hidden="true">
        ✕
      </span>
    </button>
  );
}
```

`packages/client-prototype/src/equities/Chart/InstrumentTabs.module.css`:

```css
.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
}

.tab[data-active="true"] {
  color: var(--accent);
  background: var(--panel);
  border-bottom-color: var(--accent);
}

.close {
  opacity: 0.5;
  cursor: pointer;
}

.close:hover {
  opacity: 1;
}
```

`packages/client-prototype/src/equities/Chart/TimeframePills.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Chart/TimeframePills.module.css";
import type { Timeframe } from "#/equities/types";

export interface TimeframePillsProps {
  tf: Timeframe;
  onSet(tf: Timeframe): void;
}

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M"];

// PROTO L603: the 1D/1W/1M/3M timeframe selector.
export function TimeframePills(props: TimeframePillsProps): ReactElement {
  const { tf, onSet } = props;

  return (
    <div className={styles.pills}>
      {TIMEFRAMES.map((id) => {
        return <TimeframePill key={id} id={id} active={id === tf} onSet={onSet} />;
      })}
    </div>
  );
}

interface TimeframePillProps {
  id: Timeframe;
  active: boolean;
  onSet(tf: Timeframe): void;
}

function TimeframePill(props: TimeframePillProps): ReactElement {
  const { id, active, onSet } = props;

  function handleClick(): void {
    onSet(id);
  }

  return (
    <button
      type="button"
      className={styles.pill}
      data-tf={id}
      data-active={String(active)}
      onClick={handleClick}
    >
      {id}
    </button>
  );
}
```

`packages/client-prototype/src/equities/Chart/TimeframePills.module.css`:

```css
.pills {
  display: flex;
  gap: 4px;
}

.pill {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.pill[data-active="true"] {
  color: var(--accent);
  background: var(--chip);
  border-color: var(--border-strong);
}
```

`packages/client-prototype/src/equities/Chart/InstrumentHeader.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import { EQ_META } from "#/equities/equitiesData";
import styles from "#/equities/Chart/InstrumentHeader.module.css";
import type { EqSym } from "#/equities/types";

const BID_ASK_OFFSET = 0.03;

export interface InstrumentHeaderProps {
  sym: EqSym;
  last: number;
  prev: number;
  flashOn: boolean;
  flashDir: 1 | -1;
  seriesHigh: number;
  seriesLow: number;
  vol: string;
}

// PROTO L610-618: the live instrument header — symbol lede, price + change,
// and the BID/ASK/RANGE/VOL stat strip.
export function InstrumentHeader(props: InstrumentHeaderProps): ReactElement {
  const { sym, last, prev, flashOn, flashDir, seriesHigh, seriesLow, vol } =
    props;
  const chgAbs = last - prev;
  const chgPct = (chgAbs / prev) * 100;
  const up = chgAbs >= 0;
  const dayHi = Math.max(seriesHigh, last);
  const dayLo = Math.min(seriesLow, last);
  const flashStyle = { "--flash": flashOn ? "1" : "0" } as CSSProperties;

  return (
    <div className={styles.header}>
      <div className={styles.idBlock}>
        <div
          className={styles.sym}
          data-flash={String(flashOn)}
          data-dir={flashDir === 1 ? "up" : "down"}
          style={flashStyle}
        >
          {last.toFixed(2)}
        </div>
        <div className={styles.name}>
          {sym} · {EQ_META[sym].name} · {EQ_META[sym].exch}
        </div>
      </div>
      <div className={styles.change} data-up={String(up)}>
        {up ? "+" : ""}
        {chgAbs.toFixed(2)} ({up ? "+" : ""}
        {chgPct.toFixed(2)}%)
      </div>
      <div className={styles.spacer} />
      <div className={styles.stats}>
        <Stat label="BID" value={(last - BID_ASK_OFFSET).toFixed(2)} tone="sell" />
        <Stat label="ASK" value={(last + BID_ASK_OFFSET).toFixed(2)} tone="buy" />
        <Stat
          label="DAY RANGE"
          value={`${dayLo.toFixed(2)} – ${dayHi.toFixed(2)}`}
          tone="text"
        />
        <Stat label="VOL" value={vol} tone="text" />
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone: "buy" | "sell" | "text";
}

function Stat(props: StatProps): ReactElement {
  const { label, value, tone } = props;

  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} data-tone={tone}>
        {value}
      </div>
    </div>
  );
}
```

`packages/client-prototype/src/equities/Chart/InstrumentHeader.module.css`:

```css
.header {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  flex-wrap: wrap;
  flex: none;
}

.idBlock {
  display: flex;
  flex-direction: column;
}

.sym {
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  font-size: 30px;
  letter-spacing: 0.02em;
  color: var(--text);
  transition: color 0.3s;
}

.sym[data-flash="true"][data-dir="up"] {
  color: var(--buy);
}

.sym[data-flash="true"][data-dir="down"] {
  color: var(--sell);
}

.name {
  margin-top: 3px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}

.change {
  font-family: var(--font-m, monospace);
  font-size: 14px;
  color: var(--buy);
}

.change[data-up="false"] {
  color: var(--sell);
}

.spacer {
  flex: 1;
}

.stats {
  display: flex;
  gap: 18px;
  font-family: var(--font-m, monospace);
  font-size: 11px;
}

.statLabel {
  color: var(--faint);
}

.statValue {
  margin-top: 2px;
}

.statValue[data-tone="buy"] {
  color: var(--buy);
}

.statValue[data-tone="sell"] {
  color: var(--sell);
}

.statValue[data-tone="text"] {
  color: var(--text);
}
```

`packages/client-prototype/src/equities/Chart/CandleBars.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Chart/CandleBars.module.css";
import type { ChartVm } from "#/equities/chartVm";

export interface CandleBarsProps {
  candles: ChartVm["candles"];
}

// PROTO L1343: one wick + body div per candle. All geometry rides in via the
// `--x/--top/--h/--w/--w*` custom properties on each element (the sanctioned
// inline-style escape hatch); up/down colour is a `data-up` class hook.
export function CandleBars(props: CandleBarsProps): ReactElement {
  const { candles } = props;

  return (
    <>
      {candles.map((cd) => {
        return (
          <div key={cd.key} data-candle="" data-up={String(cd.up)}>
            <span className={styles.wick} style={cd.wickStyle} />
            <span
              className={styles.body}
              style={cd.style}
              data-up={String(cd.up)}
            />
          </div>
        );
      })}
    </>
  );
}
```

`packages/client-prototype/src/equities/Chart/CandleBars.module.css`:

```css
.wick {
  position: absolute;
  left: var(--wx);
  top: var(--wtop);
  height: var(--wh);
  width: 1px;
  opacity: 0.7;
}

.body {
  position: absolute;
  left: calc(var(--x) - var(--wleft-offset, 0px));
  top: var(--top);
  height: var(--h);
  width: var(--w);
  opacity: 0.85;
}

.body[data-up="true"],
.wick[data-up="true"] {
  background: var(--buy);
}

.body[data-up="false"],
.wick[data-up="false"] {
  background: var(--sell);
}

.body[style*="--glow: 1"] {
  opacity: 1;
}
```

Note: the wick uses `--wx` (its own absolute x); the body uses `--x` minus `--wleft-offset` to centre its wider column. Both `--x`/`--w`/`--wleft-offset`/`--glow` ride on the candle `style` object and `--wx`/`--wtop`/`--wh` on `wickStyle` — matching `chartVm` in Task 4.

`packages/client-prototype/src/equities/Chart/CandleChart.tsx`:

```tsx
import type { ReactElement } from "react";

import { CandleBars } from "#/equities/Chart/CandleBars";
import styles from "#/equities/Chart/CandleChart.module.css";
import type { ChartVm } from "#/equities/chartVm";

export interface CandleChartProps {
  vm: ChartVm;
}

// PROTO L619-623: the plot area — horizontal grid lines, right-edge price
// labels, and the candle bars, all absolutely positioned within.
export function CandleChart(props: CandleChartProps): ReactElement {
  const { vm } = props;

  return (
    <div className={styles.plot}>
      {vm.grid.map((g) => {
        return <div key={g.key} className={styles.grid} style={g.style} />;
      })}
      {vm.labels.map((l) => {
        return (
          <div key={l.key} className={styles.label} style={l.style}>
            {l.txt}
          </div>
        );
      })}
      <CandleBars candles={vm.candles} />
    </div>
  );
}
```

`packages/client-prototype/src/equities/Chart/CandleChart.module.css`:

```css
.plot {
  flex: 1;
  min-height: 0;
  position: relative;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}

.grid {
  position: absolute;
  left: 0;
  right: 0;
  top: var(--gtop);
  height: 1px;
  background: var(--border);
  opacity: 0.5;
}

.label {
  position: absolute;
  right: 6px;
  top: var(--ltop);
  font-family: var(--font-m, monospace);
  font-size: 9px;
  color: var(--faint);
}
```

`packages/client-prototype/src/equities/Chart/ChartPanel.tsx`:

```tsx
import type { ReactElement } from "react";

import { CandleChart } from "#/equities/Chart/CandleChart";
import { chartVm } from "#/equities/chartVm";
import styles from "#/equities/Chart/ChartPanel.module.css";
import { InstrumentHeader } from "#/equities/Chart/InstrumentHeader";
import { InstrumentTabs } from "#/equities/Chart/InstrumentTabs";
import { TimeframePills } from "#/equities/Chart/TimeframePills";
import type { EqChartApi } from "#/equities/useEqChart";
import type { FlashEvent } from "#/equities/useEquities";
import type { EqSym } from "#/equities/types";

const FLASH_MS = 650;

export interface ChartPanelProps {
  chart: EqChartApi;
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
  now: number;
}

// PROTO L599-624: the chart panel body — a control sub-head (instrument tabs +
// timeframe pills; the outer dock Panel from Task 9 owns the maximize glyph),
// then the live instrument header over the candlestick plot.
export function ChartPanel(props: ChartPanelProps): ReactElement {
  const { chart, rates, prev, flash, vol, now } = props;
  const sel = chart.sel;
  const last = rates[sel];
  const fl = flash[sel];
  const flashOn = fl != null && now - fl.ts < FLASH_MS;
  const seriesHigh = Math.max(...chart.series.map((c) => {
    return c.h;
  }));
  const seriesLow = Math.min(...chart.series.map((c) => {
    return c.l;
  }));
  const vm = chartVm(chart.series, last, flashOn);

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <InstrumentTabs
          tabs={chart.openTabs}
          sel={sel}
          onSelect={chart.selectEq}
          onClose={chart.closeTab}
        />
        <div className={styles.spacer} />
        <TimeframePills tf={chart.tf} onSet={chart.setTf} />
      </div>
      <div className={styles.chartArea}>
        <InstrumentHeader
          sym={sel}
          last={last}
          prev={prev[sel]}
          flashOn={flashOn}
          flashDir={fl?.dir ?? 1}
          seriesHigh={seriesHigh}
          seriesLow={seriesLow}
          vol={vol[sel]}
        />
        <CandleChart vm={vm} />
      </div>
    </div>
  );
}
```

`packages/client-prototype/src/equities/Chart/ChartPanel.module.css`:

```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.spacer {
  flex: 1;
}

.chartArea {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
}
```

**Implementer note:** the `now` prop threads the flash clock; the screen (Task 9) supplies it from a 400 ms `now` ticker. `ChartPanelProps` therefore includes `now: number` (the `eq-chart` test passes a fixed value, e.g. `now={0}`).

- [ ] **Step 4: Run test to verify it passes** (add a `now` value in the test render, e.g. `now={0}`)

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-chart`
Expected: PASS.

- [ ] **Step 5: Task gate** (all green — watch `biome ci` for format + `useUniqueElementIds`).

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/equities/Chart/ \
        packages/client-prototype/tests/eq-chart.test.tsx
git commit -m "feat(client-prototype): P4 Task 5 — chart panel (tabs, header, candles)"
```

---

### Task 6: Watchlist panel

**Files:**
- Create: `packages/client-prototype/src/equities/Watchlist/WatchlistPanel.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Watchlist/WatchlistRow.tsx` (+ `.module.css`)
- Test: `packages/client-prototype/tests/eq-watchlist.test.tsx`

**Interfaces:**
- Consumes: `watchlistVm`/`WatchRowVm` (Task 4); `useFlip` (`src/motion/useFlip`); `usePreferences` (`src/shell/Preferences/usePreferences`) for `reduceMotion`; `WlSort`, `EqSym`.
- Produces: `WatchlistPanel` props `{ rows: WatchRowVm[]; wlSort: WlSort; onSelect(sym: EqSym): void; onCycleSort(): void; }`. Renders the sort-cycle control sub-head (label A–Z / % CHG / PRICE + decorative ⊕) and one `WatchlistRow` per row, FLIP-glided on re-sort keyed by `data-watch-sym`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/eq-watchlist.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { WatchlistPanel } from "#/equities/Watchlist/WatchlistPanel";
import type { WatchRowVm } from "#/equities/watchlistVm";

afterEach(cleanup);

const ROWS: WatchRowVm[] = [
  { sym: "AAPL", name: "Apple Inc", last: "229.35", chg: "+0.50%", up: true, selected: true, flashOn: false },
  { sym: "MSFT", name: "Microsoft Corp", last: "467.12", chg: "-0.20%", up: false, selected: false, flashOn: false },
];

function noop(): void {}

describe("WatchlistPanel", () => {
  test("renders a row per symbol, marks the selected one, shows the sort label", () => {
    const { container, getByText } = render(
      <PreferencesProvider>
        <WatchlistPanel rows={ROWS} wlSort="chg" onSelect={noop} onCycleSort={noop} />
      </PreferencesProvider>,
    );
    expect(container.querySelectorAll("[data-watch-sym]")).toHaveLength(2);
    expect(
      container.querySelector('[data-watch-sym="AAPL"]')?.getAttribute("data-selected"),
    ).toBe("true");
    expect(getByText("% CHG")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-watchlist`
Expected: FAIL — cannot resolve `#/equities/Watchlist/WatchlistPanel`.

- [ ] **Step 3: Write the components + CSS**

`packages/client-prototype/src/equities/Watchlist/WatchlistRow.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Watchlist/WatchlistRow.module.css";
import type { EqSym } from "#/equities/types";
import type { WatchRowVm } from "#/equities/watchlistVm";

export interface WatchlistRowProps {
  row: WatchRowVm;
  onSelect(sym: EqSym): void;
}

// PROTO L672: one watchlist row — symbol + name on the left, last + %-change
// on the right; selected/flash/direction are all `data-*` hooks.
export function WatchlistRow(props: WatchlistRowProps): ReactElement {
  const { row, onSelect } = props;

  function handleClick(): void {
    onSelect(row.sym);
  }

  return (
    <button
      type="button"
      className={styles.row}
      data-watch-sym={row.sym}
      data-selected={String(row.selected)}
      data-flash={String(row.flashOn)}
      data-up={String(row.up)}
      onClick={handleClick}
    >
      <span className={styles.left}>
        <span className={styles.sym}>{row.sym}</span>
        <span className={styles.name}>{row.name}</span>
      </span>
      <span className={styles.right}>
        <span className={styles.last} data-up={String(row.up)}>
          {row.last}
        </span>
        <span className={styles.chg} data-up={String(row.up)}>
          {row.chg}
        </span>
      </span>
    </button>
  );
}
```

`packages/client-prototype/src/equities/Watchlist/WatchlistRow.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 10px;
  margin-bottom: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: background 0.25s;
}

.row[data-selected="true"] {
  background: var(--chip);
  border-color: var(--border-strong);
}

.row[data-selected="false"][data-flash="true"][data-up="true"] {
  background: rgba(43, 255, 179, 0.08);
}

.row[data-selected="false"][data-flash="true"][data-up="false"] {
  background: rgba(255, 93, 115, 0.08);
}

.left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.sym {
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
}

.name {
  font-family: var(--font-m, monospace);
  font-size: 9px;
  color: var(--faint);
}

.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.last,
.chg {
  font-family: var(--font-m, monospace);
}

.last {
  font-size: 13px;
}

.chg {
  font-size: 9px;
}

.last[data-up="true"],
.chg[data-up="true"] {
  color: var(--buy);
}

.last[data-up="false"],
.chg[data-up="false"] {
  color: var(--sell);
}
```

`packages/client-prototype/src/equities/Watchlist/WatchlistPanel.tsx`:

```tsx
import type { ReactElement } from "react";
import { useRef } from "react";

import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";
import styles from "#/equities/Watchlist/WatchlistPanel.module.css";
import { WatchlistRow } from "#/equities/Watchlist/WatchlistRow";
import type { EqSym, WlSort } from "#/equities/types";
import type { WatchRowVm } from "#/equities/watchlistVm";

const SORT_LABEL: Record<WlSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};

export interface WatchlistPanelProps {
  rows: WatchRowVm[];
  wlSort: WlSort;
  onSelect(sym: EqSym): void;
  onCycleSort(): void;
}

// PROTO L670-674: the watchlist body — a control sub-head (sort-cycle + a
// decorative ⊕; the outer dock Panel owns the maximize glyph), then the rows.
// Rows glide by rank delta on re-sort (FLIP keyed on data-watch-sym), matching
// the FX live-rates / credit RFQ glide; disabled under reduced motion.
export function WatchlistPanel(props: WatchlistPanelProps): ReactElement {
  const { rows, wlSort, onSelect, onCycleSort } = props;
  const prefs = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const flipKey = rows.map((r) => {
    return r.sym;
  }).join(",");

  useFlip(listRef, flipKey, { reduce: prefs.reduceMotion });

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <button type="button" className={styles.sortBtn} onClick={onCycleSort}>
          ⇅ {SORT_LABEL[wlSort]}
        </button>
        <span className={styles.add} aria-hidden="true">
          ⊕
        </span>
      </div>
      <div className={styles.list} ref={listRef}>
        {rows.map((row) => {
          return (
            <div key={row.sym} data-flip-key={row.sym}>
              <WatchlistRow row={row} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

`packages/client-prototype/src/equities/Watchlist/WatchlistPanel.module.css`:

```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 6px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.sortBtn {
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--chip);
  color: var(--accent);
  font-family: var(--font-m, monospace);
  font-size: 8.5px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.add {
  color: var(--faint);
  font-size: 15px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
```

**Implementer:** confirm `useFlip`'s signature against `src/motion/useFlip.ts` — it keys on the `data-flip-key` attribute of children under the ref, and takes `(ref, key, { reduce })`. The credit RFQ grid (`src/credit/Rfqs/RfqsPanel.tsx`) is the reference caller.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-watchlist`
Expected: PASS.

- [ ] **Step 5: Task gate** (all green).

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/equities/Watchlist/ \
        packages/client-prototype/tests/eq-watchlist.test.tsx
git commit -m "feat(client-prototype): P4 Task 6 — watchlist panel + FLIP rank-glide"
```

---

### Task 7: `useEqTicket` + Order Ticket panel

**Files:**
- Create: `packages/client-prototype/src/equities/useEqTicket.ts`
- Create: `packages/client-prototype/src/equities/Ticket/OrderTicketPanel.tsx` (+ `.module.css`)
- Test: `packages/client-prototype/tests/eq-ticket.test.ts`
- Test: `packages/client-prototype/tests/eq-ticket-panel.test.tsx`

**Interfaces:**
- Consumes: `EQ_SEQ_START`, `ORDER_CAP`, `fmtNum` (Task 1); `EqOrder`, `EqSym`, `EqTicket`, `OrderSide`, `OrderType`.
- Produces:
  - `useEqTicket.ts`: `interface EqTicketApi { ticket: EqTicket; orders: EqOrder[]; newOrderId: number | null; flashMsg: string | null; setSide(s: OrderSide): void; setType(t: OrderType): void; setQty(q: string): void; stepQty(d: number): void; setLimit(l: string): void; submit(): void; }`, and `function useEqTicket(sel: EqSym, rates: Record<EqSym, number>): EqTicketApi`.
  - `OrderTicketPanel.tsx`: `OrderTicketPanel` props `{ api: EqTicketApi; sel: EqSym; last: number; }`.

- [ ] **Step 1: Write the failing tests**

`packages/client-prototype/tests/eq-ticket.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useEqTicket } from "#/equities/useEqTicket";
import type { EqSym } from "#/equities/types";

const RATES = {
  AAPL: 230, MSFT: 467, NVDA: 131, TSLA: 251,
  AMZN: 218, GOOGL: 178, META: 591, SPY: 588,
} as Record<EqSym, number>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEqTicket", () => {
  test("a Market submit books a Filled order at the live price, id 5001", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setQty("100");
    });
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders).toHaveLength(1);
    expect(result.current.orders[0].id).toBe(5001);
    expect(result.current.orders[0].status).toBe("Filled");
    expect(result.current.orders[0].price).toBe(230);
    expect(result.current.newOrderId).toBe(5001);
  });

  test("a Limit submit books a Working order at the limit price", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setType("Limit");
      result.current.setQty("50");
      result.current.setLimit("225");
    });
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders[0].status).toBe("Working");
    expect(result.current.orders[0].price).toBe(225);
  });

  test("stepQty clamps at 0 and submit with qty 0 is a no-op", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setQty("5");
      result.current.stepQty(-10);
    });
    expect(result.current.ticket.qty).toBe("0");
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders).toHaveLength(0);
  });
});
```

`packages/client-prototype/tests/eq-ticket-panel.test.tsx`:

```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { OrderTicketPanel } from "#/equities/Ticket/OrderTicketPanel";
import { useEqTicket } from "#/equities/useEqTicket";
import type { EqSym } from "#/equities/types";

const RATES = {
  AAPL: 230, MSFT: 467, NVDA: 131, TSLA: 251,
  AMZN: 218, GOOGL: 178, META: 591, SPY: 588,
} as Record<EqSym, number>;

afterEach(cleanup);

describe("OrderTicketPanel", () => {
  test("labels the submit button for the selected symbol and side", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    const { getByText } = render(
      <OrderTicketPanel api={result.current} sel="AAPL" last={230} />,
    );
    expect(getByText("BUY AAPL")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-ticket`
Expected: FAIL — cannot resolve `#/equities/useEqTicket`.

- [ ] **Step 3: Write `useEqTicket.ts`** (tracked flash timer; PROTO L1181 submitOrder)

`packages/client-prototype/src/equities/useEqTicket.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

import { EQ_SEQ_START, ORDER_CAP } from "#/equities/equitiesData";
import type {
  EqOrder,
  EqSym,
  EqTicket,
  OrderSide,
  OrderType,
} from "#/equities/types";

const FLASH_MS = 2400;

const EMPTY_TICKET: EqTicket = {
  side: "Buy",
  type: "Market",
  qty: "100",
  limit: "",
};

export interface EqTicketApi {
  ticket: EqTicket;
  orders: EqOrder[];
  newOrderId: number | null;
  flashMsg: string | null;
  setSide(side: OrderSide): void;
  setType(type: OrderType): void;
  setQty(qty: string): void;
  stepQty(delta: number): void;
  setLimit(limit: string): void;
  submit(): void;
}

function hhmm(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function useEqTicket(
  sel: EqSym,
  rates: Record<EqSym, number>,
): EqTicketApi {
  const [ticket, setTicket] = useState<EqTicket>(EMPTY_TICKET);
  const [orders, setOrders] = useState<EqOrder[]>([]);
  const [newOrderId, setNewOrderId] = useState<number | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const seqRef = useRef(EQ_SEQ_START);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Refs so the stable `submit` callback reads the live symbol/rate/ticket.
  const selRef = useRef(sel);
  selRef.current = sel;
  const ratesRef = useRef(rates);
  ratesRef.current = rates;
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }

      timers.clear();
    };
  }, []);

  const setSide = useCallback((side: OrderSide) => {
    setTicket((prev) => {
      return { ...prev, side };
    });
  }, []);

  const setType = useCallback((type: OrderType) => {
    setTicket((prev) => {
      return { ...prev, type };
    });
  }, []);

  const setQty = useCallback((qty: string) => {
    setTicket((prev) => {
      return { ...prev, qty: qty.replace(/[^0-9]/g, "") };
    });
  }, []);

  const stepQty = useCallback((delta: number) => {
    setTicket((prev) => {
      const n = Math.max(0, (Number.parseInt(prev.qty, 10) || 0) + delta);
      return { ...prev, qty: String(n) };
    });
  }, []);

  const setLimit = useCallback((limit: string) => {
    setTicket((prev) => {
      return { ...prev, limit };
    });
  }, []);

  // PROTO L1181 submitOrder: Market fills at the live price, Limit records a
  // Working order at the limit (defaulting to the live price when blank).
  const submit = useCallback(() => {
    const tk = ticketRef.current;
    const sym = selRef.current;
    const qty = Number.parseInt(tk.qty, 10) || 0;

    if (qty <= 0) {
      return;
    }

    const last = ratesRef.current[sym];
    const filled = tk.type === "Market";
    const price = filled ? last : Number.parseFloat(tk.limit) || last;
    const id = seqRef.current;
    seqRef.current += 1;

    const order: EqOrder = {
      id,
      time: hhmm(),
      sym,
      side: tk.side,
      type: tk.type,
      qty,
      price,
      status: filled ? "Filled" : "Working",
    };
    const msg = `${filled ? "Filled" : "Working"} ${tk.side} ${qty} ${sym} @ $${price.toFixed(2)}`;

    setOrders((prev) => {
      return [order, ...prev].slice(0, ORDER_CAP);
    });
    setNewOrderId(id);
    setFlashMsg(msg);

    const timeoutId = setTimeout(() => {
      timersRef.current.delete(timeoutId);
      setFlashMsg(null);
    }, FLASH_MS);
    timersRef.current.add(timeoutId);
  }, []);

  return {
    ticket,
    orders,
    newOrderId,
    flashMsg,
    setSide,
    setType,
    setQty,
    stepQty,
    setLimit,
    submit,
  };
}
```

- [ ] **Step 4: Write `OrderTicketPanel.tsx` + CSS** (PROTO L649-665)

`packages/client-prototype/src/equities/Ticket/OrderTicketPanel.tsx`:

```tsx
import type { ChangeEvent, ReactElement } from "react";

import { fmtNum } from "#/equities/equitiesData";
import styles from "#/equities/Ticket/OrderTicketPanel.module.css";
import type { EqTicketApi } from "#/equities/useEqTicket";
import type { EqSym } from "#/equities/types";

const BUYING_POWER = "$250,000";

export interface OrderTicketPanelProps {
  api: EqTicketApi;
  sel: EqSym;
  last: number;
}

// PROTO L649-665: the order ticket body — side toggle, order type, quantity
// stepper, optional limit price, a cost summary, the submit button, and a
// transient confirmation flash. (The outer dock Panel owns the head + maximize.)
export function OrderTicketPanel(props: OrderTicketPanelProps): ReactElement {
  const { api, sel, last } = props;
  const { ticket } = api;
  const qtyN = Number.parseInt(ticket.qty, 10) || 0;
  const limitN = Number.parseFloat(ticket.limit);
  const unit = ticket.type === "Limit" && limitN ? limitN : last;
  const cost = `$${fmtNum(qtyN * unit)}`;

  function handleBuy(): void {
    api.setSide("Buy");
  }

  function handleSell(): void {
    api.setSide("Sell");
  }

  function handleMarket(): void {
    api.setType("Market");
  }

  function handleLimit(): void {
    api.setType("Limit");
  }

  function handleQty(e: ChangeEvent<HTMLInputElement>): void {
    api.setQty(e.target.value);
  }

  function handleLimitPx(e: ChangeEvent<HTMLInputElement>): void {
    api.setLimit(e.target.value);
  }

  function handleDec(): void {
    api.stepQty(-10);
  }

  function handleInc(): void {
    api.stepQty(10);
  }

  return (
    <div className={styles.body}>
      <div className={styles.sideToggle}>
        <button
          type="button"
          className={styles.side}
          data-side="buy"
          data-active={String(ticket.side === "Buy")}
          onClick={handleBuy}
        >
          BUY
        </button>
        <button
          type="button"
          className={styles.side}
          data-side="sell"
          data-active={String(ticket.side === "Sell")}
          onClick={handleSell}
        >
          SELL
        </button>
      </div>

      <div className={styles.label}>Order Type</div>
      <div className={styles.typeRow}>
        <button
          type="button"
          className={styles.type}
          data-active={String(ticket.type === "Market")}
          onClick={handleMarket}
        >
          Market
        </button>
        <button
          type="button"
          className={styles.type}
          data-active={String(ticket.type === "Limit")}
          onClick={handleLimit}
        >
          Limit
        </button>
      </div>

      <div className={styles.label}>Quantity</div>
      <div className={styles.qtyRow}>
        <button type="button" className={styles.step} onClick={handleDec}>
          −
        </button>
        <input
          className={styles.qtyInput}
          value={ticket.qty}
          onChange={handleQty}
          inputMode="numeric"
        />
        <button type="button" className={styles.step} onClick={handleInc}>
          +
        </button>
      </div>

      {ticket.type === "Limit" ? (
        <>
          <div className={styles.label}>Limit Price</div>
          <input
            className={styles.limitInput}
            value={ticket.limit}
            onChange={handleLimitPx}
            placeholder={last.toFixed(2)}
          />
        </>
      ) : null}

      <div className={styles.summary}>
        <SummaryRow label="Est. Cost" value={cost} />
        <SummaryRow label="Buying Power" value={BUYING_POWER} />
        <SummaryRow label="Time in Force" value="Day" dim />
      </div>

      <button
        type="button"
        className={styles.submit}
        data-side={ticket.side === "Buy" ? "buy" : "sell"}
        onClick={api.submit}
      >
        {ticket.side === "Buy" ? "BUY " : "SELL "}
        {sel}
      </button>

      {api.flashMsg != null ? (
        <div className={styles.flash}>✓ {api.flashMsg}</div>
      ) : null}
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  dim?: boolean;
}

function SummaryRow(props: SummaryRowProps): ReactElement {
  const { label, value, dim = false } = props;

  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue} data-dim={String(dim)}>
        {value}
      </span>
    </div>
  );
}
```

`packages/client-prototype/src/equities/Ticket/OrderTicketPanel.module.css`:

```css
.body {
  padding: 16px;
  overflow: auto;
  height: 100%;
  min-height: 0;
}

.sideToggle {
  display: flex;
  gap: 3px;
  padding: 3px;
  margin-bottom: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 5px;
}

.side {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.side[data-side="buy"][data-active="true"] {
  color: var(--bg);
  background: var(--buy);
}

.side[data-side="sell"][data-active="true"] {
  color: var(--bg);
  background: var(--sell);
}

.label {
  margin-bottom: 6px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--faint);
  text-transform: uppercase;
}

.typeRow {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.type {
  flex: 1;
  padding: 7px 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-m, monospace);
  font-size: 11px;
  cursor: pointer;
}

.type[data-active="true"] {
  color: var(--accent);
  background: var(--chip);
  border-color: var(--border-strong);
}

.qtyRow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 14px;
}

.step {
  width: 32px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg2);
  color: var(--accent);
  font-size: 16px;
  cursor: pointer;
}

.qtyInput,
.limitInput {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-family: var(--font-m, monospace);
  font-size: 14px;
  outline: none;
}

.qtyInput {
  flex: 1;
  text-align: center;
  padding: 9px 0;
}

.limitInput {
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 14px;
}

.summary {
  padding: 12px;
  margin-bottom: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 5px;
}

.summaryRow {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  margin-bottom: 7px;
}

.summaryRow:last-child {
  margin-bottom: 0;
}

.summaryLabel {
  color: var(--faint);
}

.summaryValue {
  color: var(--text);
}

.summaryValue[data-dim="true"] {
  color: var(--dim);
}

.submit {
  width: 100%;
  padding: 12px 0;
  border: none;
  border-radius: 5px;
  color: var(--bg);
  font-family: var(--font-d, sans-serif);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.submit[data-side="buy"] {
  background: var(--buy);
  box-shadow: 0 0 14px var(--buy);
}

.submit[data-side="sell"] {
  background: var(--sell);
  box-shadow: 0 0 14px var(--sell);
}

.flash {
  margin-top: 12px;
  text-align: center;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--buy);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-ticket`
Expected: PASS (`eq-ticket` 3 + `eq-ticket-panel` 1).

- [ ] **Step 6: Task gate** (all green).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/equities/useEqTicket.ts \
        packages/client-prototype/src/equities/Ticket/ \
        packages/client-prototype/tests/eq-ticket.test.ts \
        packages/client-prototype/tests/eq-ticket-panel.test.tsx
git commit -m "feat(client-prototype): P4 Task 7 — useEqTicket + order ticket panel"
```

---

### Task 8: `positionsVm` + Orders/Positions blotter

**Files:**
- Create: `packages/client-prototype/src/equities/positionsVm.ts`
- Create: `packages/client-prototype/src/equities/Blotter/EqBlotterPanel.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Blotter/OrdersTable.tsx` (+ `.module.css`)
- Create: `packages/client-prototype/src/equities/Blotter/PositionsTable.tsx` (+ `.module.css`)
- Test: `packages/client-prototype/tests/positions-vm.test.ts`
- Test: `packages/client-prototype/tests/eq-blotter.test.tsx`

**Interfaces:**
- Consumes: `fmtNum` (Task 1); `EqOrder`, `EqPosition`, `EqSym`.
- Produces:
  - `positionsVm.ts`: `function positionsVm(orders: EqOrder[], rates: Record<EqSym, number>): EqPosition[]`.
  - `EqBlotterPanel` props: `{ orders: EqOrder[]; positions: EqPosition[]; view: "orders" | "positions"; onView(v: "orders" | "positions"): void; newOrderId: number | null; }`. Renders the Orders/Positions tab sub-head + count + the active table.
  - `OrdersTable` props `{ orders: EqOrder[]; newOrderId: number | null; }`; `PositionsTable` props `{ positions: EqPosition[]; }`.

- [ ] **Step 1: Write the failing tests**

`packages/client-prototype/tests/positions-vm.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { positionsVm } from "#/equities/positionsVm";
import type { EqOrder, EqSym } from "#/equities/types";

const RATES = {
  AAPL: 230, MSFT: 467, NVDA: 131, TSLA: 251,
  AMZN: 218, GOOGL: 178, META: 591, SPY: 588,
} as Record<EqSym, number>;

function order(part: Partial<EqOrder>): EqOrder {
  return {
    id: 1, time: "09:00:00", sym: "AAPL", side: "Buy",
    type: "Market", qty: 100, price: 220, status: "Filled", ...part,
  };
}

describe("positionsVm", () => {
  test("nets filled buys and sells per symbol with avg/mv/pl", () => {
    const rows = positionsVm(
      [
        order({ id: 1, side: "Buy", qty: 100, price: 220 }),
        order({ id: 2, side: "Sell", qty: 40, price: 240 }),
      ],
      RATES,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sym).toBe("AAPL");
    expect(rows[0].qty).toBe("60");
    expect(rows[0].plColor).toBe("var(--buy)");
  });

  test("net-zero symbols and Working orders drop out", () => {
    const rows = positionsVm(
      [
        order({ id: 1, side: "Buy", qty: 100 }),
        order({ id: 2, side: "Sell", qty: 100 }),
        order({ id: 3, side: "Buy", qty: 50, status: "Working" }),
      ],
      RATES,
    );
    expect(rows).toHaveLength(0);
  });
});
```

`packages/client-prototype/tests/eq-blotter.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { EqBlotterPanel } from "#/equities/Blotter/EqBlotterPanel";
import type { EqOrder } from "#/equities/types";

afterEach(cleanup);

function noop(): void {}

const ORDERS: EqOrder[] = [
  { id: 5001, time: "09:30:01", sym: "AAPL", side: "Buy", type: "Market", qty: 100, price: 230, status: "Filled" },
];

describe("EqBlotterPanel", () => {
  test("shows the orders empty state, then a row, and the 7 order headers", () => {
    const { container, getByText, rerender } = render(
      <EqBlotterPanel orders={[]} positions={[]} view="orders" onView={noop} newOrderId={null} />,
    );
    expect(getByText(/No orders/)).toBeTruthy();

    rerender(
      <EqBlotterPanel orders={ORDERS} positions={[]} view="orders" onView={noop} newOrderId={5001} />,
    );
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();
    for (const label of ["Time", "Symbol", "Side", "Type", "Qty", "Price", "Status"]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  test("the positions view shows its empty state", () => {
    const { getByText } = render(
      <EqBlotterPanel orders={[]} positions={[]} view="positions" onView={noop} newOrderId={null} />,
    );
    expect(getByText(/No open positions/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-prototype exec vitest run positions-vm eq-blotter`
Expected: FAIL — cannot resolve `#/equities/positionsVm`.

- [ ] **Step 3: Write `positionsVm.ts`** (PROTO L1379-1381)

`packages/client-prototype/src/equities/positionsVm.ts`:

```ts
import { fmtNum } from "#/equities/equitiesData";
import type { EqOrder, EqPosition, EqSym } from "#/equities/types";

interface Agg {
  sym: EqSym;
  qty: number;
  cost: number;
}

// PROTO L1379: positions are derived from filled orders — sum signed qty and
// signed cost per symbol, drop net-zero, then mark to the live price.
export function positionsVm(
  orders: EqOrder[],
  rates: Record<EqSym, number>,
): EqPosition[] {
  const map = new Map<EqSym, Agg>();

  for (const o of orders) {
    if (o.status !== "Filled") {
      continue;
    }

    const sign = o.side === "Buy" ? 1 : -1;
    const agg = map.get(o.sym) ?? { sym: o.sym, qty: 0, cost: 0 };
    agg.qty += sign * o.qty;
    agg.cost += sign * o.qty * o.price;
    map.set(o.sym, agg);
  }

  const out: EqPosition[] = [];

  for (const agg of map.values()) {
    if (agg.qty === 0) {
      continue;
    }

    const last = rates[agg.sym];
    const avg = agg.cost / agg.qty;
    const mv = agg.qty * last;
    const pl = mv - agg.cost;

    out.push({
      sym: agg.sym,
      qty: fmtNum(agg.qty),
      avg: `$${avg.toFixed(2)}`,
      last: `$${last.toFixed(2)}`,
      mv: `$${fmtNum(mv)}`,
      pl: `${pl >= 0 ? "+$" : "-$"}${fmtNum(Math.abs(pl))}`,
      plColor: pl >= 0 ? "var(--buy)" : "var(--sell)",
    });
  }

  return out;
}
```

- [ ] **Step 4: Write `OrdersTable.tsx` + `PositionsTable.tsx` + `EqBlotterPanel.tsx` + CSS**

The three components mirror `src/credit/Blotter/CreditBlotterPanel.tsx`'s grid+row structure. Full code:

`packages/client-prototype/src/equities/Blotter/OrdersTable.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import { fmtNum } from "#/equities/equitiesData";
import styles from "#/equities/Blotter/OrdersTable.module.css";
import type { EqOrder } from "#/equities/types";

export interface OrdersTableProps {
  orders: EqOrder[];
  newOrderId: number | null;
}

const HEADERS = ["Time", "Symbol", "Side", "Type", "Qty", "Price", "Status"];

// PROTO L627-630: the orders grid — a sticky 7-column header over one row per
// order; the just-submitted order flashes via the shared rowIn/rowFlash keyframes.
export function OrdersTable(props: OrdersTableProps): ReactElement {
  const { orders, newOrderId } = props;

  if (orders.length === 0) {
    return (
      <div className={styles.empty}>No orders — submit one from the ticket</div>
    );
  }

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        {HEADERS.map((h) => {
          return <span key={h}>{h}</span>;
        })}
      </div>
      {orders.map((o) => {
        return <OrdersRow key={o.id} order={o} isNew={o.id === newOrderId} />;
      })}
    </div>
  );
}

interface OrdersRowProps {
  order: EqOrder;
  isNew: boolean;
}

function OrdersRow(props: OrdersRowProps): ReactElement {
  const { order, isNew } = props;
  const accent = order.side === "Buy" ? "var(--buy)" : "var(--sell)";
  const accentStyle = { "--row-acc": accent } as CSSProperties;

  return (
    <div
      className={styles.row}
      data-order-id={order.id}
      data-new={String(isNew)}
      style={accentStyle}
    >
      <span className={styles.dim}>{order.time}</span>
      <span className={styles.sym}>{order.sym}</span>
      <span className={styles.side} data-side={order.side}>
        {order.side}
      </span>
      <span className={styles.dim}>{order.type}</span>
      <span>{fmtNum(order.qty)}</span>
      <span>${order.price.toFixed(2)}</span>
      <span className={styles.status} data-status={order.status}>
        {order.status}
      </span>
    </div>
  );
}
```

`packages/client-prototype/src/equities/Blotter/OrdersTable.module.css`:

```css
.table {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.headerRow,
.row {
  display: grid;
  grid-template-columns: 96px 80px 70px 80px 90px 100px 100px;
  min-width: 620px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-m, monospace);
}

.headerRow {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 14px;
  background: var(--panel);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--faint);
  text-transform: uppercase;
}

.row {
  align-items: center;
  font-size: 12px;
  color: var(--text);
}

.row[data-new="true"] {
  animation:
    rowIn 0.45s ease,
    rowFlashA 1.5s ease-out;
}

.dim {
  color: var(--dim);
}

.sym {
  font-weight: 600;
}

.side[data-side="Buy"] {
  color: var(--buy);
}

.side[data-side="Sell"] {
  color: var(--sell);
}

.status[data-status="Filled"] {
  color: var(--buy);
}

.status[data-status="Working"] {
  color: var(--accent);
}

.empty {
  padding: 24px;
  text-align: center;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--faint);
}
```

`packages/client-prototype/src/equities/Blotter/PositionsTable.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import styles from "#/equities/Blotter/PositionsTable.module.css";
import type { EqPosition } from "#/equities/types";

export interface PositionsTableProps {
  positions: EqPosition[];
}

const HEADERS = ["Symbol", "Qty", "Avg Px", "Last", "Mkt Value", "P/L"];

// PROTO L633-636: the positions grid — a sticky 6-column header over one row
// per open position.
export function PositionsTable(props: PositionsTableProps): ReactElement {
  const { positions } = props;

  if (positions.length === 0) {
    return <div className={styles.empty}>No open positions</div>;
  }

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        {HEADERS.map((h) => {
          return <span key={h}>{h}</span>;
        })}
      </div>
      {positions.map((p) => {
        const plStyle = { "--pl": p.plColor } as CSSProperties;

        return (
          <div key={p.sym} className={styles.row}>
            <span className={styles.sym}>{p.sym}</span>
            <span>{p.qty}</span>
            <span className={styles.dim}>{p.avg}</span>
            <span>{p.last}</span>
            <span>{p.mv}</span>
            <span className={styles.pl} style={plStyle}>
              {p.pl}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

`packages/client-prototype/src/equities/Blotter/PositionsTable.module.css`:

```css
.table {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.headerRow,
.row {
  display: grid;
  grid-template-columns: 90px 80px 100px 100px 110px 100px;
  min-width: 580px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-m, monospace);
}

.headerRow {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 14px;
  background: var(--panel);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--faint);
  text-transform: uppercase;
}

.row {
  align-items: center;
  font-size: 12px;
  color: var(--text);
}

.dim {
  color: var(--dim);
}

.sym {
  font-weight: 600;
}

.pl {
  color: var(--pl);
}

.empty {
  padding: 24px;
  text-align: center;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--faint);
}
```

`packages/client-prototype/src/equities/Blotter/EqBlotterPanel.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Blotter/EqBlotterPanel.module.css";
import { OrdersTable } from "#/equities/Blotter/OrdersTable";
import { PositionsTable } from "#/equities/Blotter/PositionsTable";
import type { EqOrder, EqPosition } from "#/equities/types";

export type EqBlotView = "orders" | "positions";

export interface EqBlotterPanelProps {
  orders: EqOrder[];
  positions: EqPosition[];
  view: EqBlotView;
  onView(view: EqBlotView): void;
  newOrderId: number | null;
}

// PROTO L626-638: the equities blotter body — an Orders/Positions tab sub-head
// with a count, then the active table. (The outer dock Panel owns maximize.)
export function EqBlotterPanel(props: EqBlotterPanelProps): ReactElement {
  const { orders, positions, view, onView, newOrderId } = props;
  const count =
    view === "orders"
      ? `${orders.length} orders`
      : `${positions.length} positions`;

  function showOrders(): void {
    onView("orders");
  }

  function showPositions(): void {
    onView("positions");
  }

  return (
    <div className={styles.body}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "orders")}
          onClick={showOrders}
        >
          ▤ Orders
        </button>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "positions")}
          onClick={showPositions}
        >
          ◴ Positions
        </button>
        <span className={styles.spacer} />
        <span className={styles.count}>{count}</span>
      </div>
      {view === "orders" ? (
        <OrdersTable orders={orders} newOrderId={newOrderId} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </div>
  );
}
```

`packages/client-prototype/src/equities/Blotter/EqBlotterPanel.module.css`:

```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 9px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.tab[data-active="true"] {
  color: var(--accent);
  background: var(--panel);
  border-bottom-color: var(--accent);
}

.spacer {
  flex: 1;
}

.count {
  margin-right: 8px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run positions-vm eq-blotter`
Expected: PASS (`positions-vm` 2 + `eq-blotter` 2).

- [ ] **Step 6: Task gate** (all green).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/equities/positionsVm.ts \
        packages/client-prototype/src/equities/Blotter/ \
        packages/client-prototype/tests/positions-vm.test.ts \
        packages/client-prototype/tests/eq-blotter.test.tsx
git commit -m "feat(client-prototype): P4 Task 8 — positionsVm + orders/positions blotter"
```

---

### Task 9: `useEqDock` + `EquitiesScreen` composition

**Files:**
- Create: `packages/client-prototype/src/equities/useEqDock.ts`
- Create: `packages/client-prototype/src/equities/EquitiesScreen.tsx` (+ `.module.css`)
- Test: `packages/client-prototype/tests/eq-dock.test.ts`
- Test: `packages/client-prototype/tests/equities-screen.test.tsx`

**Interfaces:**
- Consumes: `useMaxPanel` (`src/layout/useMaxPanel`); `Panel`, `SplitHandle`, `useSplit` (`src/layout`); all Task 2–8 hooks/panels/VMs; `usePreferences` is already used inside the watchlist.
- Produces:
  - `useEqDock.ts`: `type EqPanelId = "chart" | "eblot" | "ticket" | "watch"`, `interface EqDockApi { maxPanel: EqPanelId | null; rightCollapsed: boolean; toggleMax(id: EqPanelId): void; restore(): void; }`, `function useEqDock(): EqDockApi`.
  - `EquitiesScreen.tsx`: `function EquitiesScreen(): ReactElement` — composes the 4-panel dock; owns `useEquities`, `useEqChart`, `useEqTicket`, `useEqDock`, a 400 ms `now` ticker, the three `useSplit`s, and the derived `positionsVm`/`watchlistVm`.

- [ ] **Step 1: Write the failing tests**

`packages/client-prototype/tests/eq-dock.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useEqDock } from "#/equities/useEqDock";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useEqDock", () => {
  test("maximizing chart or eblot collapses the right aside; ticket/watch do not", () => {
    const { result } = renderHook(() => {
      return useEqDock();
    });
    expect(result.current.rightCollapsed).toBe(false);

    act(() => {
      result.current.toggleMax("chart");
    });
    expect(result.current.maxPanel).toBe("chart");
    expect(result.current.rightCollapsed).toBe(true);

    act(() => {
      result.current.restore();
    });
    expect(result.current.maxPanel).toBe(null);

    act(() => {
      result.current.toggleMax("ticket");
    });
    expect(result.current.rightCollapsed).toBe(false);
  });
});
```

`packages/client-prototype/tests/equities-screen.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EquitiesScreen } from "#/equities/EquitiesScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

function renderScreen() {
  return render(
    <PreferencesProvider>
      <EquitiesScreen />
    </PreferencesProvider>,
  );
}

describe("EquitiesScreen", () => {
  test("composes the four panels", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("equities-screen")).toBeTruthy();
  });

  test("submitting from the ticket books an order row", () => {
    const { container, getByText } = renderScreen();
    fireEvent.click(getByText(/BUY AAPL/));
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-dock equities-screen`
Expected: FAIL — cannot resolve `#/equities/useEqDock`.

- [ ] **Step 3: Write `useEqDock.ts`** (mirrors `src/credit/useCreditDock.ts`)

`packages/client-prototype/src/equities/useEqDock.ts`:

```ts
import { useMaxPanel } from "#/layout/useMaxPanel";

// Equities dock chrome: which of the four panels (if any) is maximized. The
// two wide center panels (chart/eblot) collapse the right aside to its restore
// strip when maximized — `rightCollapsed` is derived, matching the Credit
// dock's `leftCollapsed`. Maximizing an aside panel (ticket/watch) leaves the
// center untouched; CSS collapses only its aside sibling.
export type EqPanelId = "chart" | "eblot" | "ticket" | "watch";

export interface EqDockApi {
  maxPanel: EqPanelId | null;
  rightCollapsed: boolean;
  toggleMax(id: EqPanelId): void;
  restore(): void;
}

const EQ_PANEL_IDS: readonly EqPanelId[] = ["chart", "eblot", "ticket", "watch"];

export function useEqDock(): EqDockApi {
  const { maxPanel, toggleMax } = useMaxPanel<EqPanelId>(
    "rt_eq_maxPanel",
    EQ_PANEL_IDS,
  );
  const rightCollapsed: boolean = maxPanel === "chart" || maxPanel === "eblot";

  function restore(): void {
    if (maxPanel != null) {
      toggleMax(maxPanel);
    }
  }

  return { maxPanel, rightCollapsed, toggleMax, restore };
}
```

- [ ] **Step 4: Write `EquitiesScreen.tsx`** (mirrors `FxScreen`/`CreditScreen`; center column + aside, three splits, `now` ticker)

`packages/client-prototype/src/equities/EquitiesScreen.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { EqBlotterPanel } from "#/equities/Blotter/EqBlotterPanel";
import type { EqBlotView } from "#/equities/Blotter/EqBlotterPanel";
import { ChartPanel } from "#/equities/Chart/ChartPanel";
import styles from "#/equities/EquitiesScreen.module.css";
import { OrderTicketPanel } from "#/equities/Ticket/OrderTicketPanel";
import { positionsVm } from "#/equities/positionsVm";
import { useEqChart } from "#/equities/useEqChart";
import type { EqPanelId } from "#/equities/useEqDock";
import { useEqDock } from "#/equities/useEqDock";
import { useEqTicket } from "#/equities/useEqTicket";
import { useEquities } from "#/equities/useEquities";
import { WatchlistPanel } from "#/equities/Watchlist/WatchlistPanel";
import { watchlistVm } from "#/equities/watchlistVm";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";

const MAIN_SPLIT_INITIAL = 0.78; // eqAsideW 290 ≈ 1 - 290/1320
const CENTER_SPLIT_INITIAL = 0.66; // eqCenterR
const ASIDE_SPLIT_INITIAL = 0.5; // eqRightR
const NOW_INTERVAL_MS = 400;

// Named panel-id props (same useUniqueElementIds rationale as FxScreen).
const CHART_PANEL: EqPanelId = "chart";
const EBLOT_PANEL: EqPanelId = "eblot";
const TICKET_PANEL: EqPanelId = "ticket";
const WATCH_PANEL: EqPanelId = "watch";

// The Equities dock (PROTO 596-685): a center column (Chart over the Orders/
// Positions blotter, split eqCenterR) beside an aside (Order Ticket over the
// Watchlist, split eqRightR), the two split by eqAsideW. All four panels
// maximize; maximizing a center panel collapses the aside to its restore strip
// (useEqDock.rightCollapsed), while maximizing an aside panel collapses only
// its aside sibling via CSS.
export function EquitiesScreen(): ReactElement {
  const eng = useEquities();
  const chart = useEqChart();
  const ticket = useEqTicket(chart.sel, eng.rates);
  const dock = useEqDock();
  const [blotView, setBlotView] = useState<EqBlotView>("orders");
  const [now, setNow] = useState(() => {
    return Date.now();
  });

  const screenRef = useRef<HTMLDivElement | null>(null);
  const centerColRef = useRef<HTMLDivElement | null>(null);
  const asideColRef = useRef<HTMLDivElement | null>(null);

  const mainSplit = useSplit({
    storageKey: "eqAsideR",
    orientation: "v",
    initial: MAIN_SPLIT_INITIAL,
    containerRef: screenRef,
  });
  const centerSplit = useSplit({
    storageKey: "eqCenterR",
    orientation: "h",
    initial: CENTER_SPLIT_INITIAL,
    containerRef: centerColRef,
  });
  const asideSplit = useSplit({
    storageKey: "eqRightR",
    orientation: "h",
    initial: ASIDE_SPLIT_INITIAL,
    containerRef: asideColRef,
  });

  // A shared 400ms clock drives the tick-flash windows (watchlist rows, the
  // instrument header, the last candle) without each cell owning a timer.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, NOW_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  const positions = positionsVm(ticket.orders, eng.rates);
  const rows = watchlistVm({
    rates: eng.rates,
    prev: eng.prev,
    flash: eng.flash,
    sel: chart.sel,
    wlSort: chart.wlSort,
    now,
  });

  const geom = {
    "--main-ratio": mainSplit.ratio,
    "--center-ratio": centerSplit.ratio,
    "--aside-ratio": asideSplit.ratio,
  } as CSSProperties;

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-testid="equities-screen"
      data-max-panel={dock.maxPanel ?? ""}
      style={geom}
    >
      <div className={styles.centerCol} ref={centerColRef}>
        <div className={styles.chartRegion}>
          <Panel
            id={CHART_PANEL}
            head={<span className={styles.regionLabel}>◈ Chart</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <ChartPanel
              chart={chart}
              rates={eng.rates}
              prev={eng.prev}
              flash={eng.flash}
              vol={eng.vol}
              now={now}
            />
          </Panel>
        </div>

        <div className={styles.centerHandle}>
          <SplitHandle api={centerSplit} />
        </div>

        <div className={styles.eblotRegion}>
          <Panel
            id={EBLOT_PANEL}
            head={<span className={styles.regionLabel}>▤ Orders / Positions</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <EqBlotterPanel
              orders={ticket.orders}
              positions={positions}
              view={blotView}
              onView={setBlotView}
              newOrderId={ticket.newOrderId}
            />
          </Panel>
        </div>
      </div>

      <div className={styles.mainHandle}>
        <SplitHandle api={mainSplit} />
      </div>

      <div className={styles.aside} ref={asideColRef}>
        {dock.rightCollapsed ? (
          <RightCollapsedStrip onRestore={dock.restore} />
        ) : (
          <>
            <div className={styles.ticketRegion}>
              <Panel
                id={TICKET_PANEL}
                head={<span className={styles.regionLabel}>✚ Order Ticket</span>}
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <OrderTicketPanel
                  api={ticket}
                  sel={chart.sel}
                  last={eng.rates[chart.sel]}
                />
              </Panel>
            </div>

            <div className={styles.asideHandle}>
              <SplitHandle api={asideSplit} />
            </div>

            <div className={styles.watchRegion}>
              <Panel
                id={WATCH_PANEL}
                head={<span className={styles.regionLabel}>☰ Watchlist</span>}
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <WatchlistPanel
                  rows={rows}
                  wlSort={chart.wlSort}
                  onSelect={chart.selectEq}
                  onCycleSort={chart.cycleWlSort}
                />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface RightCollapsedStripProps {
  onRestore(): void;
}

// PROTO L647 (eqRightCol collapsed): the aside collapsed to a two-bar restore
// strip, shown whenever a center panel (chart/eblot) is maximized.
function RightCollapsedStrip(props: RightCollapsedStripProps): ReactElement {
  const { onRestore } = props;

  return (
    <div className={styles.collapsedStrip}>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ ORDER TICKET
      </button>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ WATCHLIST
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Write `EquitiesScreen.module.css`** (FX two-column dock CSS + Credit-style derived aside strip; all four maximize states)

`packages/client-prototype/src/equities/EquitiesScreen.module.css`:

```css
/* Equities dock (PROTO 596-685): a center column (Chart over the Orders/
   Positions blotter, split eqCenterR) beside an aside (Order Ticket over the
   Watchlist, split eqRightR), the two split by eqAsideW. Ratios flow in as
   `--main-ratio` / `--center-ratio` / `--aside-ratio` custom properties and
   drive flex-grow splits. Maximize (data-max-panel) hides the non-maximized
   panels; a maximized center panel additionally collapses the aside to its
   restore strip (rendered by EquitiesScreen when rightCollapsed). */

.screen {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.centerCol {
  display: flex;
  flex-direction: column;
  flex: var(--main-ratio) 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.aside {
  display: flex;
  flex-direction: column;
  flex: calc(1 - var(--main-ratio)) 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chartRegion {
  display: flex;
  flex-direction: column;
  flex: var(--center-ratio) 1 0;
  min-height: 0;
}

.eblotRegion {
  display: flex;
  flex-direction: column;
  flex: calc(1 - var(--center-ratio)) 1 0;
  min-height: 0;
}

.ticketRegion {
  display: flex;
  flex-direction: column;
  flex: var(--aside-ratio) 1 0;
  min-height: 0;
}

.watchRegion {
  display: flex;
  flex-direction: column;
  flex: calc(1 - var(--aside-ratio)) 1 0;
  min-height: 0;
}

.centerHandle,
.mainHandle,
.asideHandle {
  flex: none;
}

.regionLabel {
  font-family: var(--font-d, sans-serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text);
}

.collapsedStrip {
  display: flex;
  flex-direction: column;
  flex: 0 0 38px;
  gap: 1px;
  height: 100%;
  background: var(--panel-head);
}

.stripBtn {
  flex: 1;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--dim);
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.14em;
  cursor: pointer;
}

.stripBtn:hover {
  color: var(--accent);
}

/* — maximize a center panel: hide its column sibling + center handle + the
   V-split handle; the aside is already the restore strip (JS). — */

.screen[data-max-panel="chart"] .eblotRegion,
.screen[data-max-panel="chart"] .centerHandle,
.screen[data-max-panel="chart"] .mainHandle {
  display: none;
}

.screen[data-max-panel="chart"] .centerCol,
.screen[data-max-panel="chart"] .chartRegion {
  flex: 1 1 auto;
}

.screen[data-max-panel="eblot"] .chartRegion,
.screen[data-max-panel="eblot"] .centerHandle,
.screen[data-max-panel="eblot"] .mainHandle {
  display: none;
}

.screen[data-max-panel="eblot"] .centerCol,
.screen[data-max-panel="eblot"] .eblotRegion {
  flex: 1 1 auto;
}

/* — maximize an aside panel: hide only its aside sibling + aside handle; the
   center column is untouched (spec §3). — */

.screen[data-max-panel="ticket"] .watchRegion,
.screen[data-max-panel="ticket"] .asideHandle {
  display: none;
}

.screen[data-max-panel="ticket"] .ticketRegion {
  flex: 1 1 auto;
}

.screen[data-max-panel="watch"] .ticketRegion,
.screen[data-max-panel="watch"] .asideHandle {
  display: none;
}

.screen[data-max-panel="watch"] .watchRegion {
  flex: 1 1 auto;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run eq-dock equities-screen`
Expected: PASS. If `equities-screen`'s submit test is flaky under the `now` interval, keep `vi.useRealTimers()` (default) — the click is synchronous and the order books immediately.

- [ ] **Step 7: Task gate** (all green — this is the heaviest task for `biome ci`; run `biome check --write` then re-verify).

- [ ] **Step 8: Commit**

```bash
git add packages/client-prototype/src/equities/useEqDock.ts \
        packages/client-prototype/src/equities/EquitiesScreen.tsx \
        packages/client-prototype/src/equities/EquitiesScreen.module.css \
        packages/client-prototype/tests/eq-dock.test.ts \
        packages/client-prototype/tests/equities-screen.test.tsx
git commit -m "feat(client-prototype): P4 Task 9 — useEqDock + EquitiesScreen composition"
```

---

### Task 10: Shell wiring

**Files:**
- Modify: `packages/client-prototype/src/shell/AppShell.tsx`
- Test: `packages/client-prototype/tests/shell.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `EquitiesScreen` (Task 9).
- Produces: the `equities` tab renders `<EquitiesScreen />` instead of `<PlaceholderPanel tab="equities" />`.

- [ ] **Step 1: Read `AppShell.tsx` to find the tab dispatch**

Run: `grep -n "CreditScreen\|PlaceholderPanel\|tab ===" packages/client-prototype/src/shell/AppShell.tsx`
It currently has a nested ternary like `tab === "fx" ? <FxScreen /> : tab === "credit" ? <CreditScreen /> : <PlaceholderPanel tab={tab} />`.

- [ ] **Step 2: Extend the shell test**

Add to `packages/client-prototype/tests/shell.test.tsx` a test that selecting the Equities nav tab renders the equities screen. Follow the existing credit-tab test in that file; the assertion:

```tsx
test("the equities tab renders the equities screen", () => {
  const { getByText, getByTestId } = render(<AppShell />);
  fireEvent.click(getByText("Equities"));
  expect(getByTestId("equities-screen")).toBeTruthy();
});
```

(Match the existing file's imports, provider wrapping, and the exact nav label casing — check how the credit-tab test clicks its tab.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run shell`
Expected: FAIL — the equities tab still renders the placeholder (no `equities-screen` testid).

- [ ] **Step 4: Wire `EquitiesScreen` into `AppShell.tsx`**

Add the import `import { EquitiesScreen } from "#/equities/EquitiesScreen";` (in correct alphabetical import order) and extend the ternary:

```tsx
tab === "fx" ? (
  <FxScreen />
) : tab === "credit" ? (
  <CreditScreen />
) : tab === "equities" ? (
  <EquitiesScreen />
) : (
  <PlaceholderPanel tab={tab} />
)
```

(Match the file's existing formatting exactly; Biome will reformat if needed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype exec vitest run shell`
Expected: PASS.

- [ ] **Step 6: Full task gate + whole-package test run**

Run all Global-Constraints gate commands, then `pnpm --filter @rtc/client-prototype test` (the entire suite) and confirm green.

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/shell/AppShell.tsx \
        packages/client-prototype/tests/shell.test.tsx
git commit -m "feat(client-prototype): P4 Task 10 — wire EquitiesScreen into the shell"
```

---

## Post-plan self-review

**1. Spec coverage:** chart (T5), instrument header/tabs/timeframes (T5), candlestick geometry (T4 `chartVm` + T5 `CandleBars`), watchlist + FLIP (T6), sort cycle (T3+T6), order ticket + submit (T7), orders/positions blotter + derived positions (T8), price engine (T2), dock/splits/maximize/right-strip (T9 `useEqDock`+screen), shell wiring (T10), types+data+`genCandles`+stable vols (T1). Spec §3 deviations (stable vol T1; live-last-candle overlay T4 `withLiveLast`) implemented. All §5 test files present. ✅

**2. Placeholder scan:** no TBD/TODO; every code step carries complete code. Two implementer notes flag concrete adjustments (move `--wleft-offset` onto the candle body `style`; confirm `useFlip` signature against the committed hook) rather than deferring work. ✅

**3. Type consistency:** `EqSym`/`Timeframe`/`EqOrder`/`EqPosition`/`EqTicket` defined in T1 and consumed unchanged; `EquitiesApi`/`FlashEvent` (T2) consumed by T4/T5/T9; `EqChartApi` (T3) consumed by T5/T9; `EqTicketApi` (T7) consumed by T9; `EqPanelId` (T9) matches the four `data-max-panel` CSS selectors. `chartVm` `style`/`wickStyle` custom-prop names match the CandleBars CSS (with the flagged `--wleft-offset` placement fix). ✅

**Implementer reminders baked into tasks:** RNG in `useRef` never resynced; RNG/persistence never inside `setState` updaters (T2/T3/T7 compute outside); timers tracked + cleared (T7/T9); `arrow-body-style: always`; `biome ci` is the format+lint gate; never `git add .`.
