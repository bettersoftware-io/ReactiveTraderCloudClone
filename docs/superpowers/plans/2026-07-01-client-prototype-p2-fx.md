# Client-Prototype P2 — FX (Trading Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FX tab's placeholder with a faithful, readable port of the prototype's FX trading surface — dock layout, Live Rates tiles (exec overlay + RFQ-on-tile), Watchlist view, FX Blotter (sort/filter/CSV) + Activity, FLIP glide + flashes.

**Architecture:** A self-contained `fx/` feature folder: dumb CSS-Modules components + co-located mock hooks (`useFxRates`, `useFxBlotter`) + seed data (`fxData.ts`) + a seedable RNG (`mock/rng.ts`). A hand-wired `fx/layout/` dock (`useSplit`, `Panel`, maximize/collapse) — not generalized until P3. Native WAAPI FLIP (`motion/useFlip.ts`). Analytics/Positions aside is a P2.5 placeholder.

**Tech Stack:** React 19 + Vite + TypeScript strict; CSS Modules; native Web Animations API; Vitest (jsdom) smoke-only. No new runtime dependencies.

**Source of truth:** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (PROTO). FX markup lines ~346–531; FX class logic ~748–1170 and the FX view-model builders ~1256–1312. Cite these ranges rather than re-transcribing markup by hand.

**Spec:** `docs/superpowers/specs/2026-07-01-client-prototype-p2-fx.md`.

## Global Constraints

- **Self-contained.** No `@rtc/domain` / `@rtc/shared` imports; no RxJS/machines; no ViewModel seam; no React Compiler. Plain React hooks + context only.
- **CSS Modules only.** Zero inline `style={{…}}` object literals. Runtime geometry/color uses the sanctioned escape hatch: a named-const `style={x}` that sets **only** `--custom-property` values (the ESLint inline-style ban matches object literals, not variable refs — no eslint-disable needed). Class names camelCase (stylelint); custom props kebab (`--row-acc`, `--split-ratio`).
- **Faithful fidelity — do NOT "fix" these (they match the prototype):** exec-gating prefs (`confirmExec`/`oneClick`/`execSound`/`defaultNotional`) stay cosmetic — clicking a price books immediately, no confirm gate. Tile notionals seed to the literal `"1,000,000"`. RFQ threshold is `> 10_000_000` strict; notional `> 1e9` is invalid (MAX). Reject probability is `rng() < 0.12`. Blotter caps at 40 rows. Clicking the already-active filter chip is a **no-op** (not toggle-to-All).
- **Timings (verbatim):** rate walk interval 250 ms; exec resolves after **1200 ms**; RFQ request resolves after **1700 ms**; RFQ quote window **15000 ms**; expiry sweep every 400 ms; tile FLIP window 480 ms.
- **Seedable RNG for determinism.** `useFxRates(opts?)` accepts `{ rng?: () => number }`; tests pass `mulberry32(seed)`. Default (no opts) uses `Math.random` for the lively feel.
- **Motion respects reduce-motion.** FLIP short-circuits to a plain measure when `usePreferences().prefs.reduceMotion` is true.
- **Tests obey full repo lint** (CI lints `tests/` too, not just `src/`): `arrow-body-style: always` → block-body arrows with explicit `return`; `no-restricted-syntax` → **named interfaces**, never inline object param types; `rtc/newspaper-order` → helper/type declarations go **below** the `test()`/`describe()` calls (function declarations hoist). Menu/interactive non-button elements are banned (`noStaticElementInteractions`) — use `<button type="button">` for clickables. Explicit `cleanup()` in `afterEach` (Vitest `globals` off). Use `@testing-library/react` (`render`, `fireEvent`, `act`, `renderHook`).
- **Every task gate** runs, from `packages/client-prototype/`: `pnpm typecheck && pnpm test && pnpm build`, plus lint over **src and tests** (`pnpm exec eslint src tests && pnpm exec biome check src tests && pnpm exec stylelint "src/**/*.module.css"`), plus the repo-wide CI gates the local package gauntlet misses — from repo root: `pnpm lint:dead` (knip), `pnpm check:versions`, `pnpm check:deps`, `pnpm test:rules`. Green on all before the task is done.
- **Reuse P0/P1, don't re-add:** flash keyframes (`spin`, `rowIn`, `rowFlashA`, `rowFlashB`, `bookPulse`) already exist in `src/styles/global.css`. `usePreferences()` (session prefs incl. `reduceMotion`), `useTheme()`, `useClock()` already exist. `#/` subpath imports resolve to `src` (`#/fx/...`) and `#tests/`.

---

## File Structure

New files (all under `packages/client-prototype/`):

| File | Responsibility |
|---|---|
| `src/mock/rng.ts` | `mulberry32(seed)` seedable RNG |
| `src/fx/fxData.ts` | `ORDER`, `META`, `BASE_RATES`, `RFQ_THRESHOLD`, `FX_SEQ_START`, `SEED_TRADES`, `parseNotional`, `fmtNum`, `splitPrice`, `fmtDate`, `fmtShort` |
| `src/fx/types.ts` | `Sym`, `PairMeta`, `Trade`, `TileState`, `TileStage`, `RateSnapshot`, `ActivityEvent` |
| `src/fx/useFxRates.ts` | rate walk + dirs/flash/hist + per-tile exec/RFQ state machine + activity log |
| `src/fx/useFxBlotter.ts` | sort/filter/query + CSV over trades |
| `src/fx/csvExport.ts` | rows → CSV string (quote-escaped) + download trigger |
| `src/motion/useFlip.ts` | measure → invert → WAAPI play; reduce-motion aware |
| `src/fx/layout/useSplit.ts` | one pointer-drag split (ratio, capture, clamp, persist) |
| `src/fx/layout/useDockState.ts` | `maxPanel` + `asideCollapsed` (persisted) |
| `src/fx/layout/SplitHandle.tsx` + `.module.css` | H/V drag handle |
| `src/fx/layout/Panel.tsx` + `.module.css` | panel chrome (head slot + body + maximize glyph) |
| `src/fx/LiveRates/LiveRatesPanel.tsx` + `.module.css` | panel: tabs (Rates/Watchlist), CHARTS, filter chips, tile grid |
| `src/fx/LiveRates/FilterChips.tsx` + `.module.css` | currency filter chips |
| `src/fx/LiveRates/RateTile.tsx` + `.module.css` | one tile |
| `src/fx/LiveRates/TilePrice.tsx` + `.module.css` | sell/buy price block (big/pips/frac) |
| `src/fx/LiveRates/Sparkline.tsx` | SVG polyline (full + mini) |
| `src/fx/LiveRates/TileExecOverlay.tsx` + `.module.css` | overlay: executing/rfqReq/rfqRecv/success/failure |
| `src/fx/LiveRates/WatchlistView.tsx` + `.module.css` | compact table view |
| `src/fx/Blotter/FxBlotterPanel.tsx` + `.module.css` | panel: tabs (Blotter/Activity), count, filter, CSV |
| `src/fx/Blotter/TradesBlotter.tsx` + `.module.css` | column header + rows |
| `src/fx/Blotter/BlotterRow.tsx` + `.module.css` | one row (new-row flash) |
| `src/fx/Blotter/ActivityView.tsx` + `.module.css` | event-log feed |
| `src/fx/FxScreen.tsx` + `.module.css` | composes the dock; owns filter + dock state |
| `tests/fx-*.test.tsx`, `tests/fx-*.test.ts` | per-task smokes |

Modified:
- `src/shell/AppShell.tsx` — `<main>` switches `fx → <FxScreen/>`, other tabs keep `PlaceholderPanel`.
- `src/shell/PlaceholderPanel.tsx` — drop the `fx` entry from `PANEL_COPY` (now handled by FxScreen). Keep `credit`/`equities`/`admin`.

---

## Task 1: Seed data, RNG & pure formatters

**Files:**
- Create: `src/mock/rng.ts`, `src/fx/types.ts`, `src/fx/fxData.ts`
- Test: `tests/fx-data.test.ts`

**Interfaces — Produces:**
- `mulberry32(seed: number): () => number`
- `ORDER: readonly Sym[]`; `type Sym = 'EURUSD'|'GBPUSD'|'USDJPY'|'EURJPY'|'GBPJPY'|'AUDUSD'|'USDCAD'|'NZDUSD'`
- `interface PairMeta { pair: string; base: string; d: number; bigLen: number; spread: string }`
- `META: Record<Sym, PairMeta>`, `BASE_RATES: Record<Sym, number>`
- `RFQ_THRESHOLD = 10_000_000`, `FX_SEQ_START = 1043`
- `interface Trade { id:number; status:'Done'|'Rejected'; dir:'Buy'|'Sell'; symbol:Sym; dealtCcy:string; notional:string; notionalNum:number; rate:string; trader:string; tradeDate:string; valueDate:string }`
- `SEED_TRADES: Trade[]`
- `parseNotional(str: string | null): number`
- `fmtNum(n: number): string`
- `splitPrice(rate: number, meta: PairMeta): { big: string; pips: string; frac: string }`
- `fmtDate(offsetDays: number): string` (dd-MMM-yyyy), `fmtShort(offsetDays: number): string` (dd MMM)

- [ ] **Step 1: Write the failing test** — `tests/fx-data.test.ts`

```ts
import { describe, expect, test } from "vitest";

import {
  BASE_RATES,
  fmtNum,
  META,
  ORDER,
  parseNotional,
  RFQ_THRESHOLD,
  SEED_TRADES,
  splitPrice,
} from "#/fx/fxData";
import { mulberry32 } from "#/mock/rng";

describe("fxData formatters", () => {
  test("parseNotional handles commas, k/m suffixes, and junk", () => {
    expect(parseNotional("1,000,000")).toBe(1_000_000);
    expect(parseNotional("2m")).toBe(2_000_000);
    expect(parseNotional("500k")).toBe(500_000);
    expect(Number.isNaN(parseNotional("abc"))).toBe(true);
    expect(Number.isNaN(parseNotional(null))).toBe(true);
  });

  test("fmtNum rounds and groups", () => {
    expect(fmtNum(1000000)).toBe("1,000,000");
    expect(fmtNum(1234.6)).toBe("1,235");
  });

  test("splitPrice splits a 5dp EURUSD quote into big/pips/frac", () => {
    expect(splitPrice(1.09213, META.EURUSD)).toEqual({
      big: "1.09",
      pips: "21",
      frac: "3",
    });
  });

  test("splitPrice splits a 3dp JPY quote", () => {
    expect(splitPrice(151.203, META.USDJPY)).toEqual({
      big: "151",
      pips: "20",
      frac: "3",
    });
  });

  test("ORDER has 8 pairs and META/BASE_RATES cover each", () => {
    expect(ORDER).toHaveLength(8);
    for (const sym of ORDER) {
      expect(META[sym]).toBeDefined();
      expect(BASE_RATES[sym]).toBeGreaterThan(0);
    }
  });

  test("SEED_TRADES has the 5 seeded rows with the RFQ threshold constant present", () => {
    expect(SEED_TRADES).toHaveLength(5);
    expect(SEED_TRADES[0].id).toBe(1042);
    expect(RFQ_THRESHOLD).toBe(10_000_000);
  });

  test("mulberry32 is deterministic for a fixed seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @rtc/client-prototype test -- fx-data` → FAIL (module not found).

- [ ] **Step 3: Implement `src/mock/rng.ts`**

```ts
/** Deterministic 32-bit PRNG (mulberry32). Returns a float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Implement `src/fx/types.ts`** — the shared FX types (`Sym`, `PairMeta`, `Trade`, plus `TileStage`/`TileState`/`ActivityEvent` used by later tasks so they import from one place):

```ts
export type Sym =
  | "EURUSD" | "GBPUSD" | "USDJPY" | "EURJPY"
  | "GBPJPY" | "AUDUSD" | "USDCAD" | "NZDUSD";

export interface PairMeta {
  pair: string;
  base: string;
  d: number;
  bigLen: number;
  spread: string;
}

export type Dir = "Buy" | "Sell";

export interface Trade {
  id: number;
  status: "Done" | "Rejected";
  dir: Dir;
  symbol: Sym;
  dealtCcy: string;
  notional: string;
  notionalNum: number;
  rate: string;
  trader: string;
  tradeDate: string;
  valueDate: string;
}

export type TileStage =
  | "idle" | "executing" | "rfqReq" | "rfqRecv" | "success" | "failure";

export interface TileState {
  stage: TileStage;
  trade?: { id: number; dir?: Dir };
  quote?: { Sell: string; Buy: string };
  rfqStart?: number;
  rfqEnd?: number;
}

export interface ActivityEvent {
  t: string;
  tag: string;
  msg: string;
  color: string;
}
```

- [ ] **Step 5: Implement `src/fx/fxData.ts`** — verbatim values from PROTO 749–758 (`meta`/`order`), 806 (`baseRates`), 784 (`RFQ_THRESHOLD`/`fxSeq`), 818 (`fxTrades` seeds), 831–837/1144 (`_fmtDate`/`_fmtShort`/`fmtNum`/`parseNotional`), 1149 (`fmt`):

```ts
import type { PairMeta, Sym, Trade } from "#/fx/types";

export const ORDER: readonly Sym[] = [
  "EURUSD", "GBPUSD", "USDJPY", "EURJPY", "GBPJPY", "AUDUSD", "USDCAD", "NZDUSD",
];

export const META: Record<Sym, PairMeta> = {
  EURUSD: { pair: "EUR / USD", base: "EUR", d: 5, bigLen: 4, spread: "1.4" },
  GBPUSD: { pair: "GBP / USD", base: "GBP", d: 5, bigLen: 4, spread: "1.8" },
  USDJPY: { pair: "USD / JPY", base: "USD", d: 3, bigLen: 3, spread: "1.6" },
  EURJPY: { pair: "EUR / JPY", base: "EUR", d: 3, bigLen: 3, spread: "2.1" },
  GBPJPY: { pair: "GBP / JPY", base: "GBP", d: 3, bigLen: 3, spread: "2.6" },
  AUDUSD: { pair: "AUD / USD", base: "AUD", d: 5, bigLen: 4, spread: "2.0" },
  USDCAD: { pair: "USD / CAD", base: "USD", d: 5, bigLen: 4, spread: "2.2" },
  NZDUSD: { pair: "NZD / USD", base: "NZD", d: 5, bigLen: 4, spread: "2.4" },
};

export const BASE_RATES: Record<Sym, number> = {
  EURUSD: 1.09213, GBPUSD: 1.26414, USDJPY: 151.203, EURJPY: 165.142,
  GBPJPY: 191.085, AUDUSD: 0.66121, USDCAD: 1.36782, NZDUSD: 0.61054,
};

export const RFQ_THRESHOLD = 10_000_000;
export const FX_SEQ_START = 1043;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function parseNotional(str: string | null): number {
  if (str == null) {
    return NaN;
  }
  let s = String(str).trim().toLowerCase().replace(/,/g, "");
  let m = 1;
  if (s.endsWith("m")) {
    m = 1e6;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    m = 1e3;
    s = s.slice(0, -1);
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : Math.round(n * m);
}

export function splitPrice(
  rate: number,
  meta: PairMeta,
): { big: string; pips: string; frac: string } {
  const s = rate.toFixed(meta.d);
  return {
    big: s.slice(0, meta.bigLen),
    pips: s.slice(meta.bigLen, meta.bigLen + 2),
    frac: s.slice(meta.bigLen + 2),
  };
}

export function fmtDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function fmtShort(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

function seedTrade(
  id: number,
  status: Trade["status"],
  dir: Trade["dir"],
  symbol: Sym,
  dealtCcy: string,
  notionalNum: number,
  rate: string,
  trader: string,
  off: number,
): Trade {
  return {
    id, status, dir, symbol, dealtCcy,
    notional: fmtNum(notionalNum), notionalNum, rate, trader,
    tradeDate: fmtDate(off), valueDate: fmtDate(off + 2),
  };
}

export const SEED_TRADES: Trade[] = [
  seedTrade(1042, "Done", "Buy", "EURUSD", "EUR", 1_000_000, "1.09213", "A.Stark", -3),
  seedTrade(1041, "Done", "Sell", "USDJPY", "USD", 2_000_000, "151.203", "A.Stark", -3),
  seedTrade(1040, "Rejected", "Buy", "GBPUSD", "GBP", 500_000, "1.26414", "N.Romanoff", -4),
  seedTrade(1039, "Done", "Sell", "EURJPY", "EUR", 1_500_000, "165.142", "S.Rogers", -5),
  seedTrade(1038, "Done", "Buy", "AUDUSD", "AUD", 3_000_000, "0.66121", "B.Banner", -6),
];
```

- [ ] **Step 6: Run test to verify it passes** — `pnpm --filter @rtc/client-prototype test -- fx-data` → PASS.
- [ ] **Step 7: Run full task gate** (typecheck/test/build + src&tests lint + knip/check:versions/check:deps/test:rules). All green.
- [ ] **Step 8: Commit** — `feat(client-prototype): P2 FX seed data, RNG & formatters`.

---

## Task 2: `useFxRates` — the rate walk

**Files:**
- Create: `src/fx/useFxRates.ts`
- Test: `tests/fx-rates-walk.test.ts`

**Interfaces:**
- Consumes: `ORDER`, `META`, `BASE_RATES` (`#/fx/fxData`), `mulberry32` (`#/mock/rng`), `Sym` (`#/fx/types`).
- Produces (this task ships the walk half of the hook; Task 4 extends it with the exec machine):
  - `interface RatesApi { rates: Record<Sym, number>; opens: Record<Sym, number>; dirs: Record<Sym, 1 | -1>; flash: Record<Sym, { dir: 1 | -1; ts: number }>; hist: Record<Sym, number[]>; }`
  - `interface UseFxRatesOptions { rng?: () => number; intervalMs?: number }`
  - `function useFxRates(opts?: UseFxRatesOptions): RatesApi` (extended in Task 4)

**Walk algorithm (PROTO 1129–1136, FX portion only):** per pair, `step = meta.d === 3 ? 0.02 : 0.00018`; `dlt = (rng() - 0.5) * step`; `nv = rate + dlt` (if `nv <= 0`, keep old); `rates[k] = +nv.toFixed(meta.d)`; `dirs[k] = dlt >= 0 ? 1 : -1`; `hist[k] = [...hist[k].slice(1), rates[k]]` (30-length); `flash[k] = { dir, ts }`. `opens` = the initial `BASE_RATES` snapshot (move pips are measured vs opens). Interval default 250 ms.

- [ ] **Step 1: Write the failing test** — drive one tick with a seeded RNG and a fake timer.

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BASE_RATES } from "#/fx/fxData";
import { useFxRates } from "#/fx/useFxRates";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates walk", () => {
  test("a seeded tick moves rates and sets a direction flag", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: mulberry32(1), intervalMs: 250 });
    });

    expect(result.current.rates.EURUSD).toBe(BASE_RATES.EURUSD);
    expect(result.current.opens.EURUSD).toBe(BASE_RATES.EURUSD);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.dirs.EURUSD === 1 || result.current.dirs.EURUSD === -1).toBe(true);
    expect(result.current.hist.EURUSD).toHaveLength(30);
    expect(result.current.flash.EURUSD.ts).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.
- [ ] **Step 3: Implement the walk** (state via `useState`; `setInterval` in `useEffect` with cleanup; `hist` seeded 30-wide from `BASE_RATES`). Keep the RNG in a `useRef` so the effect doesn't re-seed each render. Guard the flash timestamp with `Date.now()`.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full task gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P2 useFxRates random walk`.

---

## Task 3: Presentational tile — `TilePrice`, `Sparkline`, `RateTile`

**Files:**
- Create: `src/fx/LiveRates/TilePrice.tsx` (+ `.module.css`), `src/fx/LiveRates/Sparkline.tsx`, `src/fx/LiveRates/RateTile.tsx` (+ `.module.css`)
- Test: `tests/fx-tile.test.tsx`

**Interfaces:**
- Consumes: `splitPrice`, `META`, `fmtShort` (`#/fx/fxData`); `Sym`, `PairMeta` (`#/fx/types`).
- Produces:
  - `interface TileVm { sym: Sym; meta: PairMeta; rate: number; movePips: number; moveUp: boolean; flashOn: boolean; hist: number[]; notional: string; notionalInvalid: boolean; isRfq: boolean; showCharts: boolean; onNotional(v: string): void; onReset(): void; onSell(): void; onBuy(): void; }`
  - `function RateTile(props: { vm: TileVm; overlay?: ReactElement | null }): ReactElement` — renders `data-tile-sym={vm.sym}`, the header (pair + move arrow/pips), the notional input + reset + MAX badge, the sell/spread/buy row (`TilePrice`), the sparkline (when `showCharts`), the SPT footer, and `overlay` (Task 4 passes `<TileExecOverlay/>`; here it's `null`).
  - `function TilePrice(props: { side: "Sell" | "Buy"; rate: number; meta: PairMeta; moveUp: boolean; flashOn: boolean; isRfq: boolean }): ReactElement` — computes `pu = meta.d === 3 ? 0.01 : 0.0001`, `half = parseFloat(meta.spread)/2 * pu`, price = `side==="Sell" ? rate-half : rate+half`, splits via `splitPrice`, renders big/pips/frac with the pip block getting `data-flash={flashOn}` + `--move-color` custom prop.
  - `function Sparkline(props: { hist: number[]; mini?: boolean; moveUp: boolean }): ReactElement` — SVG polyline; full = `viewBox 0 0 300 40`, points `hist.map((v,i)=>(i/(len-1)*300)+","+(40-(v-mn)/rng*36))`; mini = last 12 points, `viewBox 0 0 60 18`, `(i/11*60)+","+(18-(v-mn)/rng*16)` (PROTO 1269–1271). Stroke uses `--move-color`.

**Markup reference:** PROTO 373–416 (tile), 385–414 (price blocks), 411–413 (sparkline). Convert inline styles to CSS Modules: static→class; sell/buy/move color and flash→`data-*` + `--move-color`/`--flash` custom props; spread label static.

- [ ] **Step 1: Write the failing test**

```ts
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { META } from "#/fx/fxData";
import { RateTile, type TileVm } from "#/fx/LiveRates/RateTile";

afterEach(cleanup);

function makeVm(overrides: Partial<TileVm>): TileVm {
  return {
    sym: "EURUSD", meta: META.EURUSD, rate: 1.09213, movePips: 4, moveUp: true,
    flashOn: false, hist: Array.from({ length: 30 }, (_v, i) => 1.09 + i * 1e-4),
    notional: "1,000,000", notionalInvalid: false, isRfq: false, showCharts: true,
    onNotional: vi.fn(), onReset: vi.fn(), onSell: vi.fn(), onBuy: vi.fn(),
    ...overrides,
  };
}

describe("RateTile", () => {
  test("renders the pair, a big price segment, and the notional", () => {
    const { getByText, container } = render(<RateTile vm={makeVm({})} overlay={null} />);
    expect(getByText("EUR / USD")).toBeTruthy();
    expect(getByText("1.09")).toBeTruthy();
    expect(container.querySelector('[data-tile-sym="EURUSD"]')).toBeTruthy();
  });

  test("shows the RFQ badge when isRfq and MAX when invalid", () => {
    const { getAllByText, getByText } = render(
      <RateTile vm={makeVm({ isRfq: true, notionalInvalid: true })} overlay={null} />,
    );
    expect(getAllByText("RFQ").length).toBeGreaterThan(0);
    expect(getByText("MAX")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `TilePrice`, `Sparkline`, `RateTile`** + their CSS Modules (newspaper order: exported component first, private subcomponents/helpers below — note `component-newspaper` is client-react-scoped so not enforced here, but follow it voluntarily per P1). The `--move-color`/`--flash`/`--split-*` custom props go through a named-const `style={…}` variable ref (no eslint-disable).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full task gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P2 Live Rates tile (price/sparkline)`.

---

## Task 4: Exec/RFQ state machine + `TileExecOverlay`

**Files:**
- Modify: `src/fx/useFxRates.ts` (add the tile machine + activity log)
- Create: `src/fx/LiveRates/TileExecOverlay.tsx` (+ `.module.css`)
- Test: `tests/fx-exec.test.tsx`, `tests/fx-overlay.test.tsx`

**Interfaces:**
- Extends `RatesApi` (Task 2) with:
  - `notionals: Record<Sym, string>`, `tiles: Record<Sym, TileState>`, `activity: ActivityEvent[]`, `trades: Trade[]`, `newRowId: number | null`, `pnl: number`
  - handlers: `onNotional(sym: Sym, raw: string): void`, `onReset(sym: Sym): void`, `onSell(sym: Sym): void`, `onBuy(sym: Sym): void`, `onDismiss(sym: Sym): void`
- Produces: `function TileExecOverlay(props: { tile: TileState; meta: PairMeta; now: number }): ReactElement | null` — pure render of `tile.stage` (PROTO 418–450).

**State machine (PROTO 1145–1154, 1173, 1272–1291) — port verbatim:**
- `onNotional(sym, raw)`: `n = parseNotional(raw)`; store `Number.isNaN(n) ? raw : fmtNum(n)`.
- `onReset(sym)`: set notional to `"1,000,000"`.
- `priceClick(sym, side)` (behind `onSell`/`onBuy`): `n = parseNotional(notionals[sym])`; if `Number.isNaN(n) || n > 1e9` return; `isRfq = n > RFQ_THRESHOLD`; if `isRfq`: if `tiles[sym].stage === "rfqRecv"` → `book(sym, side, quote[side])`; else if idle → `initTileRfq(sym)`; return. Else `book(sym, side)`.
- `book(sym, side, forced?)`: set stage `executing`; after **1200 ms**: `pu = meta.d===3?0.01:0.0001`; `half = parseFloat(spread)/2*pu`; `rate = forced ?? (side==="Sell"?cur-half:cur+half)`; `rateStr = (+rate).toFixed(d)`; `rejected = rng() < 0.12`; if rejected → stage `failure` + log `REJECT`; else build `Trade`, prepend to `trades` (cap 40), `pnl = Math.max(0, pnl + Math.round((rng()-0.3)*800))`, set `newRowId = id`, stage `success`, log `TRADE`.
- `initTileRfq(sym)`: stage `rfqReq` + log `RFQ`; after **1700 ms**: `half = parseFloat(spread)*1.4/2*pu`; stage `rfqRecv` with `quote={Sell:(cur-half).toFixed(d),Buy:(cur+half).toFixed(d)}`, `rfqStart=now`, `rfqEnd=now+15000`.
- `onDismiss(sym)`: stage `idle`.
- Expiry sweep (run inside the interval `useEffect`, every 400 ms via a second interval, PROTO 1173): any `rfqRecv` tile with `now > rfqEnd` → `idle`.
- `logEvt(tag, msg, color)`: prepend `{ t: hhmm(), tag, msg, color }` to `activity` (cap 40). `hhmm()` = `new Date().toTimeString().slice(0,8)`.
- `fxSeq` counter starts at `FX_SEQ_START`; keep it in a `useRef`.

**Overlay render (PROTO 418–450):** `stage==="idle"` → return null (tile shows no overlay). `busy` (`executing`/`rfqReq`): spinner (`.spinner` uses `spin` keyframe) + label (`REQUESTING QUOTE…` for rfqReq, `EXECUTING…` for executing) + CANCEL when `rfqReq`. `rfqRecv`: `QUOTE · {secs}s` + Sell/Buy quote buttons (`data-side`) + progress bar (`--rfq-pct` from `(rfqEnd-now)/(rfqEnd-rfqStart)*100`) + REJECT. `success`: `✓` + `You Bought/Sold` + `base notional` + RATE/SPT/ID row + DISMISS. `failure`: `✕` + `Trade Rejected` + `Execution failed — retry` + DISMISS.

- [ ] **Step 1: Write the failing exec test** — `tests/fx-exec.test.tsx`

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useFxRates } from "#/fx/useFxRates";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates exec machine", () => {
  test("a small-notional buy walks idle → executing → success and appends a trade", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      // seed chosen so rng() >= 0.12 on the reject roll → a fill, not a reject
      return useFxRates({ rng: mulberry32(7) });
    });

    act(() => {
      result.current.onBuy("EURUSD");
    });
    expect(result.current.tiles.EURUSD.stage).toBe("executing");

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.tiles.EURUSD.stage).toBe("success");
    expect(result.current.trades[0].symbol).toBe("EURUSD");
    expect(result.current.newRowId).toBe(result.current.trades[0].id);
    expect(result.current.activity[0].tag).toBe("TRADE");
  });

  test("a >10M notional buy requests a quote → rfqRecv", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: mulberry32(3) });
    });

    act(() => {
      result.current.onNotional("EURUSD", "25m");
    });
    act(() => {
      result.current.onBuy("EURUSD");
    });
    expect(result.current.tiles.EURUSD.stage).toBe("rfqReq");

    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(result.current.tiles.EURUSD.stage).toBe("rfqRecv");
    expect(result.current.tiles.EURUSD.quote?.Buy).toBeTruthy();
  });
});
```

> If the chosen seed happens to land `< 0.12` on the reject roll, pick another small seed so the fill branch is exercised — the assertion documents the fill path. (The reject path is covered implicitly by the 12% constant in Task 1 and the overlay test below.)

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement the machine** in `useFxRates.ts` (timers via `setTimeout`; keep `fxSeq`/`rng` in refs; expiry via a 400 ms interval alongside the walk). Preserve `trades` seeded from `SEED_TRADES`.
- [ ] **Step 4: Run exec test → PASS.**
- [ ] **Step 5: Write the overlay test** — `tests/fx-overlay.test.tsx`: render `TileExecOverlay` with `stage:"success"` (expect `You Bought`, DISMISS) and `stage:"failure"` (expect `Trade Rejected`); `stage:"idle"` returns null (`container.firstChild` is null).
- [ ] **Step 6: Implement `TileExecOverlay`** + CSS; wire it into `RateTile` via the `overlay` prop from the composing panel (Task 5).
- [ ] **Step 7: Run overlay test → PASS.**
- [ ] **Step 8: Full task gate.** Green.
- [ ] **Step 9: Commit** — `feat(client-prototype): P2 tile exec/RFQ state machine + overlay`.

---

## Task 5: `FilterChips`, `useFlip`, `LiveRatesPanel` (tiles view)

**Files:**
- Create: `src/motion/useFlip.ts`, `src/fx/LiveRates/FilterChips.tsx` (+ `.module.css`), `src/fx/LiveRates/LiveRatesPanel.tsx` (+ `.module.css`)
- Test: `tests/fx-filter.test.tsx`, `tests/fx-flip.test.ts`

**Interfaces:**
- Consumes: `useFxRates` api, `RateTile`/`TileExecOverlay`, `ORDER`/`META`, `usePreferences`.
- Produces:
  - `type Filter = "All" | "EUR" | "USD" | "GBP" | "JPY" | "AUD"`
  - `function FilterChips(props: { value: Filter; onChange(f: Filter): void }): ReactElement` — chips `["All","EUR","USD","GBP","JPY","AUD"]`; active chip click is a **no-op** (PROTO 1256: `value===f ? (no change) : onChange(f)`); active chip gets `data-active`.
  - `function useFlip(rootRef: RefObject<HTMLElement | null>, key: string, opts?: { reduce?: boolean; durMs?: number }): void` — after paint, query `[data-flip-key]` under root; if `key` changed and `!reduce`, for each node compute `dx/dy` vs its previous rect and play a WAAPI `translate(dx,dy)→0` glide (PROTO 856–867); otherwise just re-measure. Store prev rects + prev key in refs.
  - `function LiveRatesPanel(props: { rates: <useFxRates api>; filter: Filter; onFilter(f: Filter): void; view: "rates" | "watch"; onView(v): void; showCharts: boolean; onToggleCharts(): void }): ReactElement` — renders the panel head (Rates/Watchlist tabs, CHARTS toggle, FilterChips), then the tile grid (filtered `ORDER` by `filter==="All" || sym.includes(filter)`, PROTO 1264) with `useFlip(gridRef, filter)`; each tile gets `data-flip-key={sym}` and its `<TileExecOverlay/>`. (WatchlistView wired in Task 6; here `view==="watch"` may render a stub that Task 6 replaces.)

- [ ] **Step 1: Write the filter test** — `tests/fx-filter.test.tsx`: render `FilterChips` with `value="All"`; click `EUR` → `onChange("EUR")`; click the active chip (`value="EUR"`, click `EUR`) → `onChange` NOT called.
- [ ] **Step 2: Write the flip test** — `tests/fx-flip.test.ts`: `renderHook` a tiny harness that calls `useFlip` with a ref to a container holding two `[data-flip-key]` nodes; assert it doesn't throw across a key change and (jsdom rects are 0, so no animation) that `Element.prototype.animate` is not called when `reduce:true`. Spy on `animate` via `vi.spyOn(Element.prototype, "animate")`.

```ts
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FilterChips } from "#/fx/LiveRates/FilterChips";

afterEach(cleanup);

describe("FilterChips", () => {
  test("clicking a chip reports it; clicking the active chip is a no-op", () => {
    const onChange = vi.fn();
    const { getByText, rerender } = render(
      <FilterChips value="All" onChange={onChange} />,
    );
    getByText("EUR").click();
    expect(onChange).toHaveBeenCalledWith("EUR");

    onChange.mockClear();
    rerender(<FilterChips value="EUR" onChange={onChange} />);
    getByText("EUR").click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail.**
- [ ] **Step 4: Implement `useFlip`, `FilterChips`, `LiveRatesPanel`** + CSS. `useFlip` uses `useLayoutEffect` + refs; wrap `node.animate(...)` in `try/catch` (jsdom may not implement it) — matches PROTO 862.
- [ ] **Step 5: Run tests → PASS.**
- [ ] **Step 6: Full task gate.** Green.
- [ ] **Step 7: Commit** — `feat(client-prototype): P2 filter chips + FLIP + Live Rates panel`.

---

## Task 6: `WatchlistView`

**Files:**
- Create: `src/fx/LiveRates/WatchlistView.tsx` (+ `.module.css`)
- Modify: `src/fx/LiveRates/LiveRatesPanel.tsx` (render `WatchlistView` when `view==="watch"`)
- Test: `tests/fx-watchlist.test.tsx`

**Interfaces:**
- Produces: `function WatchlistView(props: { rows: WatchRow[] }): ReactElement` where `interface WatchRow { sym: Sym; mid: string; movePips: number; moveUp: boolean; spread: string; hist: number[] }`. Compact table: header `Pair | Mid | Move | Spread | Trend`, one row per pair with a mini `Sparkline` (PROTO 464–470). `LiveRatesPanel` builds `rows` from the same filtered `ORDER` + rates.

- [ ] **Step 1: Write the failing test** — render `WatchlistView` with 2 rows; assert both `sym` codes and the `Mid`/`Move`/`Spread`/`Trend` header appear; assert 2 `<svg>` mini-sparklines.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `WatchlistView`** + CSS; wire the `view` toggle in `LiveRatesPanel` (Rates/Watchlist tab already present from Task 5).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full task gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P2 FX Watchlist view`.

---

## Task 7: `useFxBlotter` + `TradesBlotter` + `BlotterRow` + CSV

**Files:**
- Create: `src/fx/useFxBlotter.ts`, `src/fx/csvExport.ts`, `src/fx/Blotter/TradesBlotter.tsx` (+ `.module.css`), `src/fx/Blotter/BlotterRow.tsx` (+ `.module.css`)
- Test: `tests/fx-blotter.test.tsx`, `tests/fx-csv.test.ts`

**Interfaces:**
- Consumes: `Trade` (`#/fx/types`), `fmtNum`.
- Produces:
  - `type SortField = "tradeId"|"status"|"tradeDate"|"direction"|"symbol"|"dealtCurrency"|"notional"|"spotRate"|"valueDate"|"traderName"`
  - `interface BlotterApi { rows: Trade[]; sort: { field: SortField; dir: 1 | -1 }; query: string; count: number; onSort(f: SortField): void; onQuery(v: string): void; onExport(): void; cols: { field: SortField; label: string; ind: string }[] }`
  - `function useFxBlotter(trades: Trade[]): BlotterApi`
  - `function toCsv(headers: string[], rows: (string | number)[][]): string` (`csvExport.ts`) + `downloadCsv(filename, csv)` (guards `document`/`URL` for jsdom).
  - `function TradesBlotter(props: { api: BlotterApi }): ReactElement`, `function BlotterRow(props: { trade: Trade; isNew: boolean }): ReactElement` — row grid uses the 10-col template (PROTO 1308), `isNew` adds `data-new` + `--row-acc` (`Rejected→--sell`, `Buy→--buy`, else `--sell`) so `rowIn`+`rowFlashA/B` fire.

**Sort/filter (PROTO 1157, 1162):** `onSort(f)`: `dir = field===f ? -dir : 1`. Rows: filter by lowercased query joined over `[id,status,dir,symbol,dealtCcy,notional,rate,trader,tradeDate]`, then sort by a `val(field)` extractor (`tradeId→id`, `notional→notionalNum`, `spotRate→parseFloat(rate)`, else the string field), comparator returns `-dir/+dir`. Columns (PROTO 1306): `[['tradeId','ID'],['status','Status'],['tradeDate','Date'],['direction','Dir'],['symbol','CCYCCY'],['dealtCurrency','Deal'],['notional','Notional'],['spotRate','Rate'],['valueDate','Value'],['traderName','Trader']]`; `ind` = `' ▲'`/`' ▼'` on the active field. CSV headers (PROTO 1160): `['Trade ID','Status','Trade Date','Direction','CCYCCY','Deal CCY','Notional','Rate','Value Date','Trader']`. CSV escaping (PROTO 1159): wrap each field in quotes, `"`→`""`.

- [ ] **Step 1: Write the CSV test** — `tests/fx-csv.test.ts`: `toCsv(["A","B"], [[1,'x"y']])` → `'"A","B"\n"1","x""y"'`.
- [ ] **Step 2: Write the blotter test** — `tests/fx-blotter.test.tsx`: `renderHook(() => useFxBlotter(SEED_TRADES))`; default sort `tradeId` desc → `rows[0].id===1042`; `act(onSort("tradeId"))` flips to asc → `rows[0].id===1038`; `act(onQuery("gbpusd"))` → 1 row (id 1040). Then render `TradesBlotter` and assert the 10 column labels + a `data-new` row when a row's id matches (pass a fresh trade).
- [ ] **Step 3: Run both to verify they fail.**
- [ ] **Step 4: Implement `csvExport.ts`, `useFxBlotter.ts`, `TradesBlotter`, `BlotterRow`** + CSS.
- [ ] **Step 5: Run tests → PASS.**
- [ ] **Step 6: Full task gate.** Green.
- [ ] **Step 7: Commit** — `feat(client-prototype): P2 FX blotter (sort/filter/CSV)`.

---

## Task 8: `ActivityView` + `FxBlotterPanel`

**Files:**
- Create: `src/fx/Blotter/ActivityView.tsx` (+ `.module.css`), `src/fx/Blotter/FxBlotterPanel.tsx` (+ `.module.css`)
- Test: `tests/fx-activity.test.tsx`

**Interfaces:**
- Consumes: `ActivityEvent` (`#/fx/types`), `useFxBlotter` api, `TradesBlotter`.
- Produces:
  - `function ActivityView(props: { events: ActivityEvent[] }): ReactElement` — feed rows `time | tag | msg` (tag colored via `--tag-color` custom prop); empty state `No activity yet — execute a trade to populate the feed` when `events.length===0` (PROTO 493–496).
  - `function FxBlotterPanel(props: { api: BlotterApi; activity: ActivityEvent[]; view: "blotter"|"activity"; onView(v): void }): ReactElement` — head with Blotter/Activity tabs, count, filter input (blotter view only), CSV button; body is `TradesBlotter` or `ActivityView`.

- [ ] **Step 1: Write the failing test** — render `ActivityView` with `[]` → empty-state text present; render with one event → its `msg` + `tag` present. Render `FxBlotterPanel` with `view="activity"` → shows the feed, not the column header.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `ActivityView` + `FxBlotterPanel`** + CSS.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full task gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P2 FX activity feed + blotter panel`.

---

## Task 9: Dock — `useSplit`, `SplitHandle`, `Panel`, `useDockState`

**Files:**
- Create: `src/fx/layout/useSplit.ts`, `src/fx/layout/useDockState.ts`, `src/fx/layout/SplitHandle.tsx` (+ `.module.css`), `src/fx/layout/Panel.tsx` (+ `.module.css`)
- Test: `tests/fx-split.test.ts`, `tests/fx-panel.test.tsx`

**Interfaces:**
- Produces:
  - `interface SplitApi { ratio: number; handleProps: { onPointerDown(e: React.PointerEvent): void; role: "separator"; "data-orientation": "h" | "v" }; }`
  - `function useSplit(opts: { storageKey: string; orientation: "h" | "v"; initial: number; min?: number; containerRef: RefObject<HTMLElement | null> }): SplitApi` — `onPointerDown`: `setPointerCapture`, record start coord + start ratio + container size; `onPointerMove` (bound on the element): `delta = (orientation==="v" ? e.clientX-startX : e.clientY-startY) / size`; `ratio = clamp(startRatio + delta, min, 1-min)` (min default 0.15); `onPointerUp`: release capture + persist ratio to `localStorage[storageKey]`. Initial value reads `localStorage` then `initial`.
  - `type PanelId = "tiles" | "fxblot" | "ana" | "pos"`
  - `interface DockApi { maxPanel: PanelId | null; asideCollapsed: boolean; toggleMax(id: PanelId): void; toggleAside(): void }`
  - `function useDockState(): DockApi` (persist both to `localStorage`).
  - `function Panel(props: { id: PanelId; head: ReactElement; children: ReactNode; maxPanel: PanelId | null; onToggleMax(id: PanelId): void }): ReactElement` — wraps head+body; sets `data-max={maxPanel===id}`; maximize button glyph `⤢`/`⤡` toggles via `data-max`.
  - `SplitHandle(props: { api: SplitApi }): ReactElement` — thin bar; `data-orientation`; inner grip.

**Persisted defaults (PROTO 823):** `fxStackR: 0.66` (tiles vs blotter), `asideW` handled as a `v` split with `initial` ratio ≈ `0.27` (aside is ~360 of a ~1320 main; store as a ratio for symmetry), `fxRightR: 0.5` (aside inner, used in P2.5). Use `--split-ratio` custom prop on the grid rows/cols so CSS drives the layout; the ratio flows through a named-const `style={geom}`.

- [ ] **Step 1: Write the split test** — `tests/fx-split.test.ts`: `renderHook(useSplit,...)`; simulate `onPointerDown` then a manual `onPointerMove` (dispatch a `PointerEvent` or call the bound handler) with a known delta on a stubbed container (`getBoundingClientRect` mocked to width 1000/height 1000, and stub `setPointerCapture`/`releasePointerCapture` as no-ops); assert `ratio` moved toward the drag and is clamped within `[min, 1-min]`; assert the persisted value lands in `localStorage`.
- [ ] **Step 2: Write the panel/dock test** — `tests/fx-panel.test.tsx`: `renderHook(useDockState)` → `toggleMax("tiles")` sets `maxPanel==="tiles"`, again → null; `toggleAside()` flips `asideCollapsed`. Render `Panel` with `maxPanel="tiles"` and `id="tiles"` → root has `data-max="true"`; click the maximize button → `onToggleMax("tiles")`.
- [ ] **Step 3: Run both to verify they fail.**
- [ ] **Step 4: Implement `useSplit`, `useDockState`, `SplitHandle`, `Panel`** + CSS (maximize/collapse styling; `data-max` fills the section, siblings hidden).
- [ ] **Step 5: Run tests → PASS.**
- [ ] **Step 6: Full task gate.** Green.
- [ ] **Step 7: Commit** — `feat(client-prototype): P2 dock (split/maximize/collapse)`.

---

## Task 10: `FxScreen` composition + AppShell wiring

**Files:**
- Create: `src/fx/FxScreen.tsx` (+ `.module.css`)
- Modify: `src/shell/AppShell.tsx`, `src/shell/PlaceholderPanel.tsx`
- Test: `tests/fx-screen.test.tsx`, and update `tests/shell.test.tsx` if it asserts the fx placeholder.

**Interfaces:**
- Consumes: everything above (`useFxRates`, `useFxBlotter`, `useDockState`, `useSplit`, `LiveRatesPanel`, `FxBlotterPanel`, `Panel`, `SplitHandle`).
- Produces: `function FxScreen(): ReactElement` — owns `filter`, `view` (rates/watch), `blotView` (blotter/activity), `showCharts`; builds the dock: left column = `Panel(tiles: LiveRatesPanel)` / `SplitHandle(h)` / `Panel(fxblot: FxBlotterPanel)`, then `SplitHandle(v)`, then the **aside column** = `Panel(ana)` + `SplitHandle(h)` + `Panel(pos)` each with a **P2.5 placeholder body** (`Analytics · P2.5` / `Positions · P2.5`), collapsible to a strip via `useDockState`. Root `data-testid="fx-screen"`.

**AppShell change:** replace `<PlaceholderPanel tab={tab} />` body with a switch — `tab === "fx" ? <FxScreen /> : <PlaceholderPanel tab={tab} />`. Import `FxScreen`.

**PlaceholderPanel change:** the `PANEL_COPY` map is typed `Record<Tab, string>` but `fx` is no longer rendered through it. Narrow the map to the non-fx tabs: change the type to `Record<Exclude<Tab, "fx">, string>` and drop the `fx` entry (keeps knip/types honest — `PlaceholderPanel` is only reached for credit/equities/admin now).

- [ ] **Step 1: Write the failing test** — `tests/fx-screen.test.tsx`

```ts
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ThemeProvider } from "#/theme/ThemeProvider";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { FxScreen } from "#/fx/FxScreen";

afterEach(cleanup);

function renderFx() {
  return render(
    <ThemeProvider>
      <PreferencesProvider>
        <FxScreen />
      </PreferencesProvider>
    </ThemeProvider>,
  );
}

describe("FxScreen", () => {
  test("renders the Live Rates and Blotter panels plus the P2.5 aside placeholders", () => {
    const { getByText, getByTestId } = renderFx();
    expect(getByTestId("fx-screen")).toBeTruthy();
    expect(getByText("◧ Live Rates")).toBeTruthy();
    expect(getByText(/Analytics · P2\.5/)).toBeTruthy();
    expect(getByText(/Positions · P2\.5/)).toBeTruthy();
  });
});
```

> Confirm the exact provider import paths against P1 before writing (`ThemeProvider`, `PreferencesProvider`) — adjust if P1 exported them from an index. The panel-head label text (`◧ Live Rates`) must match what Task 5 rendered.

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `FxScreen`** + CSS; wire `AppShell` and narrow `PlaceholderPanel`.
- [ ] **Step 4: Update `tests/app.test.tsx` / `tests/shell.test.tsx`** if they assert `panel-fx` or the fx placeholder copy — the fx tab now renders `fx-screen`. Adjust those assertions to the new reality (fx → `getByTestId("fx-screen")`).
- [ ] **Step 5: Run the full package test suite → all green** (`pnpm --filter @rtc/client-prototype test`).
- [ ] **Step 6: Full task gate** incl. `pnpm dev`-free `pnpm build` and the repo-wide CI gates.
- [ ] **Step 7: Commit** — `feat(client-prototype): P2 FxScreen composition + tab wiring`.

---

## Self-Review (completed during authoring)

**Spec coverage:** dock (T9) · Live Rates tiles + editable notional + reset + MAX (T3) · exec overlay + RFQ-on-tile (T4) · Watchlist (T6) · FX Blotter sort/filter/CSV (T7) · Activity (T8) · FLIP + flashes (T5, reusing P0 keyframes) · seedable RNG (T1/T2) · P2.5 aside placeholder + StatusBar-static + cosmetic-prefs fidelity (T10 + Global Constraints). No spec requirement is unmapped.

**Placeholder scan:** no TBD/TODO; each code step carries real code or an exact PROTO line cite for pure-markup transcription (consistent with the P0/P1 plans).

**Type consistency:** `Sym`/`PairMeta`/`Trade`/`TileState`/`ActivityEvent` are defined once in `fx/types.ts` (T1) and imported everywhere; `RatesApi` (T2) is the base that T4 extends; `BlotterApi`/`SortField` (T7) feed T8/T10; `PanelId`/`DockApi`/`SplitApi` (T9) feed T10. Handler names (`onSell`/`onBuy`/`onNotional`/`onReset`/`onDismiss`, `onSort`/`onQuery`/`onExport`, `toggleMax`/`toggleAside`) are used identically across tasks.
