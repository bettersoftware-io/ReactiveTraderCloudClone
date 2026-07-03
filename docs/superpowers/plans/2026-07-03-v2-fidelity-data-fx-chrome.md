# v2 Fidelity — Demo-Data Realism + FX Right Column + Chrome: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app render like the v2 prototype on first paint — realistic FX rates, seeded demo state in every domain simulator, a 360px two-panel FX right rail (Analytics + Positions), prototype-faithful chrome (nav, panel-head tabs, boot log, header right cluster), and FX tile detail fixes.

**Architecture:** All data realism lives in `@rtc/domain` simulators (single source for browser, WS server, and RN). The FX right column split happens at the composition root (`appPanelRegistry` + `defaultLayoutPort`) per ADR-004 §2c. Chrome/tile changes are `client-react` CSS-module + component edits behind the existing ViewModel seam; new UI state (CHARTS toggle, head tabs) is local React state exposed via semantic `data-*` attributes.

**Tech Stack:** TypeScript, RxJS (domain), React 19 + CSS Modules (client-react), Vitest + RTL contract tier, Playwright visual goldens.

**Spec:** `docs/superpowers/specs/2026-07-03-v2-fidelity-data-fx-chrome-design.md` (PROTO = `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`; PROTO line refs below are into that file).

## Global Constraints

- **Verbatim rule:** PROTO values in this plan (rates, seed rows, styles, copy) are transcription targets — no rounding, renaming, or "improvements".
- **Dependency rule:** `@rtc/domain` may depend only on rxjs; no new runtime deps in any package.
- **Dumb-UI rule:** no rxjs/localStorage/fetch imports in `packages/client-react/src/ui`; data arrives via `useViewModel()` hooks; local component state is allowed.
- **ADR-004:** any new ViewModel member must be added to the real factory AND `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts` AND `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` (compile-enforced).
- **Gradient-token rule (PR #100):** `--panel`/`--panel-head`/`--chip` may hold CSS gradients on 3d skins — always use the `background:` shorthand with these tokens; never `background-color:`, never SVG `fill=`, never a state rule that overrides only the longhand.
- **No lint disables.** CI runs Biome + ESLint (`lint:eslint`, `lint:eslint:types`) + stylelint (`lint:css`) — Biome-clean ≠ CI-clean.
- **Inline `style={{…}}` props are banned** in client-react src (ESLint `no-restricted-syntax`); use CSS modules + `--custom-property` geometry via the established pattern (7 existing opt-outs only).
- **Named component props types:** `XxxProps` named types for component params (repo ESLint convention).
- **Commits:** every commit ends with the two trailers used in this repo (Co-Authored-By: Claude Fable 5 + Claude-Session line).
- **Monetary/copy exactness:** currency labels are 3-letter ISO; PnL headline format is exactly `(pnl >= 0 ? "+" : "-") + "$" + (Math.abs(pnl) / 1000).toFixed(1) + "k"`.
- Run all commands from the worktree root. Before Task 1: `pnpm install --frozen-lockfile && pnpm build` (workspace dists must exist or client tests fail with "Failed to resolve import @rtc/client-core").

## File Structure (created/modified)

```
packages/domain/src/fx/currencyPair.ts                      MOD  baseMid + typicalSpreadPips
packages/domain/src/simulators/PricingSimulator.ts          MOD  base rates, pip-scaled spread/step
packages/domain/src/analytics/formatPnlHeadline.ts          NEW  "+$17.1k" formatter
packages/domain/src/analytics/netExposure.ts                NEW  per-currency aggregation
packages/domain/src/simulators/AnalyticsSimulator.ts        MOD  PROTO-scale positions + 17120 seed
packages/domain/src/simulators/TradeStoreSimulator.ts       MOD  5 seed trades
packages/domain/src/trades/trade.ts (path verify)           MOD  trader field (if absent)
packages/domain/src/simulators/InstrumentSimulator.ts       MOD  PROTO instrument catalogue
packages/domain/src/simulators/DealerSimulator.ts           MOD  PROTO dealer catalogue
packages/domain/src/simulators/CreditRfqSimulator.ts        MOD  2 seed RFQs
packages/domain/src/simulators/EventLogSimulator.ts         MOD  6-event seed snapshot
packages/domain/src/index.ts                                MOD  export new helpers
packages/client-core/src/layout/defaultLayoutPort.ts        MOD  360px rail + fx-positions
packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx  MOD  fixed-width cells + head slot
packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx     MOD  fx-positions + head content
packages/client-react/src/ui/fx/analytics/AnalyticsPanel.tsx (+css)       MOD  drop dup title, restyle
packages/client-react/src/ui/fx/analytics/PnlValue.tsx (+css)             MOD  k-format headline
packages/client-react/src/ui/fx/analytics/PnlChart.tsx (+css)             MOD  gradient area fill
packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx (+css)          MOD  PROTO bar metrics
packages/client-react/src/ui/fx/positions/PositionsPanel.tsx (+css)       NEW  NET EXPOSURE panel
packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx (+css)         MOD  nav, avatar, EN, LIVE/PROD
packages/client-react/src/ui/shell/boot/BootSequence.tsx (+css)           MOD  boot log lines
packages/client-react/src/ui/fx/liveRates/* (tile css, panel)             MOD  tile nits, CHARTS toggle
packages/client-react/src/ui/fx/blotter/* (head tabs)                     MOD  tabs/count/filter/CSV
packages/client-react/src/ui/shell/status/*                               MOD  GW label, P&L segment
```

Paths marked "verify" are confirmed in the task's first step. Tests live beside sources (domain) and in `packages/client-react/tests/ui/contract/specs/**` (contract tier).

---

### Task 1: Currency pair `baseMid` + `typicalSpreadPips`

**Files:**
- Modify: `packages/domain/src/fx/currencyPair.ts`
- Test: `packages/domain/src/fx/currencyPair.test.ts` (create if absent — check first)

**Interfaces:**
- Produces: `CurrencyPair` gains `readonly baseMid: number; readonly typicalSpreadPips: number;` — Task 2 consumes both; the values below are the single source of truth for realistic rates.

- [ ] **Step 1: Write the failing test**

Append to (or create) `packages/domain/src/fx/currencyPair.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { KNOWN_CURRENCY_PAIRS } from "./currencyPair.js";

const EXPECTED_BASE_MIDS: Record<string, number> = {
  EURUSD: 1.09213,
  USDJPY: 151.203,
  GBPUSD: 1.26414,
  GBPJPY: 191.085,
  EURJPY: 165.142,
  AUDUSD: 0.66121,
  NZDUSD: 0.61054,
  EURCAD: 1.49385,
  EURAUD: 1.65172,
};

const EXPECTED_SPREAD_PIPS: Record<string, number> = {
  EURUSD: 1.4,
  USDJPY: 1.6,
  GBPUSD: 1.8,
  GBPJPY: 2.6,
  EURJPY: 2.1,
  AUDUSD: 2.0,
  NZDUSD: 2.4,
  EURCAD: 2.2,
  EURAUD: 2.0,
};

describe("KNOWN_CURRENCY_PAIRS realism metadata", () => {
  it("every pair carries the PROTO base mid", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.baseMid, pair.symbol).toBe(EXPECTED_BASE_MIDS[pair.symbol]);
    }
  });

  it("every pair carries the PROTO typical spread in pips", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.typicalSpreadPips, pair.symbol).toBe(
        EXPECTED_SPREAD_PIPS[pair.symbol],
      );
    }
  });

  it("base mids are consistent with rate precision", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(Number(pair.baseMid.toFixed(pair.ratePrecision))).toBe(
        pair.baseMid,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/domain test -- run src/fx/currencyPair.test.ts`
Expected: FAIL — `baseMid` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add the fields**

In `packages/domain/src/fx/currencyPair.ts`, extend the interface (after `defaultNotional`):

```ts
export interface CurrencyPair {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
  readonly base: string;
  readonly terms: string;
  readonly defaultNotional: number;
  /** PROTO baseRates (dc.html L804); EURCAD/EURAUD cross-derived (spec §3.1). */
  readonly baseMid: number;
  /** PROTO meta.spread in pips (dc.html L750-755). */
  readonly typicalSpreadPips: number;
}
```

Then add to each `KNOWN_CURRENCY_PAIRS` entry (keep existing fields untouched):

| symbol | add |
|---|---|
| EURUSD | `baseMid: 1.09213, typicalSpreadPips: 1.4,` |
| USDJPY | `baseMid: 151.203, typicalSpreadPips: 1.6,` |
| GBPUSD | `baseMid: 1.26414, typicalSpreadPips: 1.8,` |
| GBPJPY | `baseMid: 191.085, typicalSpreadPips: 2.6,` |
| EURJPY | `baseMid: 165.142, typicalSpreadPips: 2.1,` |
| AUDUSD | `baseMid: 0.66121, typicalSpreadPips: 2.0,` |
| NZDUSD | `baseMid: 0.61054, typicalSpreadPips: 2.4,` |
| EURCAD | `baseMid: 1.49385, typicalSpreadPips: 2.2,` |
| EURAUD | `baseMid: 1.65172, typicalSpreadPips: 2.0,` |

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/domain test -- run src/fx/currencyPair.test.ts`
Expected: PASS (3 tests).

Also run the full domain suite to catch consumers of the widened type:
`pnpm --filter @rtc/domain test` and `pnpm --filter @rtc/domain typecheck`
Expected: PASS (adding readonly fields is non-breaking; any literal `CurrencyPair` fixtures elsewhere in domain that now miss the fields will fail typecheck — extend those fixtures with `baseMid`/`typicalSpreadPips` values from the table, or plausible values for fictional test pairs).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/fx/currencyPair.ts packages/domain/src/fx/currencyPair.test.ts
git commit -m "feat(domain): PROTO base mids + typical spreads on currency pairs"
```

---

### Task 2: PricingSimulator — realistic rates, pip-scaled spread and step

**Files:**
- Modify: `packages/domain/src/simulators/PricingSimulator.ts`
- Modify: `packages/domain/src/simulators/PricingSimulator.test.ts`
- Check (likely no change): `packages/domain/src/simulators/PricingSimulator.contract.test.ts`

**Interfaces:**
- Consumes: `CurrencyPair.baseMid`, `CurrencyPair.pipsPosition`, `CurrencyPair.typicalSpreadPips`, `CurrencyPair.ratePrecision` (Task 1).
- Produces: ticks whose `mid` starts at `baseMid` and whose `ask/bid = mid ± typicalSpreadPips/2 × pipUnit`. No API change to `PricingPort`.

- [ ] **Step 1: Update the spread pins and add realism tests (failing first)**

In `PricingSimulator.test.ts`:

Replace the test `"ask = mid + 0.0002 and bid = mid - 0.0002"` (lines 36–44) with:

```ts
  it("ask/bid = mid ± half the pair's typical spread in pip units", async () => {
    const engine = new PricingSimulator();

    // EURUSD: pipsPosition 4 → pip unit 0.0001; spread 1.4 pips → half 0.00007
    const eur = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    for (const tick of eur) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.00007, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.00007, 10);
    }

    // USDJPY: pipsPosition 2 → pip unit 0.01; spread 1.6 pips → half 0.008
    const jpy = await firstValueFrom(engine.getPriceHistory("USDJPY"));
    for (const tick of jpy) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.008, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.008, 10);
    }
  });

  it("initial mids stay within history-walk range of the PROTO base mid", async () => {
    const engine = new PricingSimulator();
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      const history = await firstValueFrom(engine.getPriceHistory(pair.symbol));
      const stepSize = pair.pipsPosition === 2 ? 0.02 : 0.00018;
      // 50 history steps of at most stepSize/2 each from baseMid, plus up to
      // half an ulp of toFixed rounding per step — bound with full stepSize.
      const maxDrift = PRICE_HISTORY_SIZE * stepSize;
      for (const tick of history) {
        expect(Math.abs(tick.mid - pair.baseMid), pair.symbol).toBeLessThanOrEqual(
          maxDrift + 1e-9,
        );
      }
    }
  });

  it("live mids respect the pair's rate precision", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const ticksPromise = lastValueFrom(
      engine.getPriceUpdates("USDJPY").pipe(take(PRICE_HISTORY_SIZE + 3), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 5);
    const ticks = await ticksPromise;
    for (const tick of ticks.slice(PRICE_HISTORY_SIZE)) {
      expect(Number(tick.mid.toFixed(3))).toBe(tick.mid);
    }
  });
```

Add the imports the new tests need at the top of the file:

```ts
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
```

Update the RFQ-widening test (lines 72–85): `0.0002` becomes `0.00007`:

```ts
    // priceChange = 0.3 / 10^4 = 0.00003; EURUSD half-spread = 0.00007
    const expectedAsk = quote.mid + 0.00007 + 0.00003;
    const expectedBid = quote.mid - 0.00007 - 0.00003;
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/PricingSimulator.test.ts`
Expected: FAIL — spread still flat 0.0002, mids random in [0,10).

- [ ] **Step 3: Rewrite the simulator internals**

In `PricingSimulator.ts`, replace lines 18 and 22–48 (constants, `PairState`, `generateInitialMid`, `applyRandomWalk`, `createTick`) with:

```ts
const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

interface PairState {
  mid: number;
  history: PriceTick[];
  halfSpread: number;
  stepSize: number;
  ratePrecision: number;
}

/** Pip unit: 10^-pipsPosition (0.01 for JPY-quoted pairs, 0.0001 otherwise). */
function pipUnit(pipsPosition: number): number {
  return 10 ** -pipsPosition;
}

/** PROTO tick step (dc.html L1132): 0.02 for JPY-quoted pairs, 0.00018 otherwise. */
function stepSizeFor(pair: CurrencyPair): number {
  return pair.pipsPosition === 2 ? 2 * pipUnit(2) : 1.8 * pipUnit(4);
}

function applyRandomWalk(state: PairState): number {
  const next = state.mid + (Math.random() - 0.5) * state.stepSize;
  const rounded = Number(next.toFixed(state.ratePrecision));
  return rounded > 0 ? rounded : state.mid;
}

function createTick(
  symbol: string,
  state: PairState,
  timestamp: number,
): PriceTick {
  return {
    symbol,
    mid: state.mid,
    ask: state.mid + state.halfSpread,
    bid: state.mid - state.halfSpread,
    valueDate: new Date().toISOString().slice(0, 10),
    creationTimestamp: timestamp,
  };
}

function tickInterval(): number {
  return Math.max(MIN_TICK_INTERVAL_MS, Math.random() * MAX_TICK_INTERVAL_MS);
}
```

Replace `initPair` (lines 70–82) with:

```ts
  private initPair(pair: CurrencyPair): void {
    const state: PairState = {
      mid: pair.baseMid,
      history: [],
      halfSpread: (pair.typicalSpreadPips / 2) * pipUnit(pair.pipsPosition),
      stepSize: stepSizeFor(pair),
      ratePrecision: pair.ratePrecision,
    };
    const now = Date.now();

    for (let i = PRICE_HISTORY_SIZE - 1; i >= 0; i--) {
      state.mid = applyRandomWalk(state);
      const timestamp = now - i * 500; // ~500ms between historical ticks
      state.history.push(createTick(pair.symbol, state, timestamp));
    }

    this.pairs.set(pair.symbol, state);
  }
```

In `getPriceUpdates`, the live tick body (lines 108–109) becomes:

```ts
            pairState.mid = applyRandomWalk(pairState);
            const tick = createTick(symbol, pairState, Date.now());
```

In `getRfqQuote` (lines 145–149), use the pair's spread:

```ts
      const result: RfqQuoteResult = {
        ask: state.mid + state.halfSpread + priceChange,
        bid: state.mid - state.halfSpread - priceChange,
        mid: state.mid,
      };
```

Delete the now-unused `HALF_SPREAD` constant. Keep `rfqResponseDelayMs` untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/PricingSimulator.test.ts` — Expected: PASS.
Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain typecheck` — Expected: PASS (the contract test asserts structure, not spread magnitude; if any other domain test pinned 0.0002, update it to the pair-scaled value the same way as Step 1).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/simulators/PricingSimulator.ts packages/domain/src/simulators/PricingSimulator.test.ts
git commit -m "feat(domain): pricing simulator walks PROTO base rates with pip-scaled spread"
```

---

### Task 3: Domain formatters + net-exposure helper

**Files:**
- Create: `packages/domain/src/analytics/formatPnlHeadline.ts`
- Create: `packages/domain/src/analytics/netExposure.ts`
- Create: `packages/domain/src/analytics/formatPnlHeadline.test.ts`
- Create: `packages/domain/src/analytics/netExposure.test.ts`
- Modify: `packages/domain/src/index.ts` (exports — match how `formatPnlValue` is exported there)

**Interfaces:**
- Consumes: `CurrencyPairPosition` from `packages/domain/src/analytics/position.js` (`{ symbol, basePnl, baseTradedAmount, counterTradedAmount }`).
- Produces (Tasks 9–10, 14 consume):
  - `formatPnlHeadline(pnl: number): string` — `17120 → "+$17.1k"`, `-1499 → "-$1.5k"`.
  - `formatPnlK(value: number): string` — `13000 → "+13k"`, `-4000 → "-4k"`.
  - `netExposureByCurrency(positions: readonly CurrencyPairPosition[]): readonly CurrencyExposure[]` with `CurrencyExposure = { currency: string; amountMillions: number }`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/analytics/formatPnlHeadline.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatPnlHeadline, formatPnlK } from "./formatPnlHeadline.js";

describe("formatPnlHeadline (PROTO dc.html L1299)", () => {
  it("formats positives as +$X.Xk", () => {
    expect(formatPnlHeadline(17120)).toBe("+$17.1k");
    expect(formatPnlHeadline(29100)).toBe("+$29.1k");
  });

  it("formats negatives as -$X.Xk", () => {
    expect(formatPnlHeadline(-1499)).toBe("-$1.5k");
  });

  it("formats zero as +$0.0k", () => {
    expect(formatPnlHeadline(0)).toBe("+$0.0k");
  });
});

describe("formatPnlK (PROTO bar values, dc.html L1302)", () => {
  it("rounds to whole k with explicit sign", () => {
    expect(formatPnlK(13000)).toBe("+13k");
    expect(formatPnlK(-4000)).toBe("-4k");
    expect(formatPnlK(800)).toBe("+1k");
    expect(formatPnlK(0)).toBe("+0k");
  });
});
```

`packages/domain/src/analytics/netExposure.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "./position.js";
import { netExposureByCurrency } from "./netExposure.js";

function position(
  symbol: string,
  baseTradedAmount: number,
  counterTradedAmount: number,
): CurrencyPairPosition {
  return { symbol, basePnl: 0, baseTradedAmount, counterTradedAmount };
}

describe("netExposureByCurrency", () => {
  it("aggregates base amounts into the base currency and counter amounts into the terms currency", () => {
    const result = netExposureByCurrency([
      position("EURUSD", 6_200_000, -6_800_000),
      position("EURJPY", 4_000_000, -4_300_000),
      position("USDJPY", -13_400_000, 11_300_000),
    ]);
    expect(result).toEqual([
      { currency: "EUR", amountMillions: 10.2 },
      { currency: "USD", amountMillions: -20.2 },
      { currency: "JPY", amountMillions: 7 },
    ]);
  });

  it("preserves first-appearance order and rounds to one decimal", () => {
    const result = netExposureByCurrency([
      position("GBPUSD", -4_120_000, 5_240_000),
    ]);
    expect(result).toEqual([
      { currency: "GBP", amountMillions: -4.1 },
      { currency: "USD", amountMillions: 5.2 },
    ]);
  });

  it("drops currencies that net to zero", () => {
    const result = netExposureByCurrency([
      position("EURUSD", 1_000_000, 0),
      position("EURJPY", -1_000_000, 500_000),
    ]);
    expect(result).toEqual([{ currency: "JPY", amountMillions: 0.5 }]);
  });

  it("returns empty for no positions", () => {
    expect(netExposureByCurrency([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/domain test -- run src/analytics/formatPnlHeadline.test.ts src/analytics/netExposure.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`packages/domain/src/analytics/formatPnlHeadline.ts`:

```ts
/**
 * PROTO headline P&L format (dc.html L1299):
 * (pnl >= 0 ? "+" : "-") + "$" + (abs(pnl)/1000).toFixed(1) + "k"
 */
export function formatPnlHeadline(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${(Math.abs(pnl) / 1000).toFixed(1)}k`;
}

/**
 * PROTO per-pair bar value format (dc.html L1302): whole-k with explicit sign.
 */
export function formatPnlK(value: number): string {
  const k = Math.round(Math.abs(value) / 1000);
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${k}k`;
}
```

`packages/domain/src/analytics/netExposure.ts` — the base/terms aggregation with zero-drop and insertion order ALREADY exists as `aggregatePositionsByCurrency` (`packages/domain/src/analytics/aggregatePositions.ts:31`, returns `{ currency, tradedAmount, radius, sign, text }`). Do NOT re-implement it — build on top:

```ts
import { aggregatePositionsByCurrency } from "./aggregatePositions.js";
import type { CurrencyPairPosition } from "./position.js";

export interface CurrencyExposure {
  readonly currency: string;
  readonly amountMillions: number;
}

/**
 * PROTO net-exposure view of the book (dc.html L1300): per-currency net
 * traded amount in millions, one decimal. Aggregation semantics (base amount
 * -> base ccy, counter amount -> terms ccy, zero nets dropped, insertion
 * order) come from aggregatePositionsByCurrency.
 */
export function netExposureByCurrency(
  positions: readonly CurrencyPairPosition[],
): readonly CurrencyExposure[] {
  return aggregatePositionsByCurrency(positions).map((node) => {
    return {
      currency: node.currency,
      amountMillions: Math.round(node.tradedAmount / 100_000) / 10,
    };
  });
}
```

Export both modules from `packages/domain/src/index.ts` following the existing `formatPnlValue` export style (find it with `grep -n formatPnlValue packages/domain/src/index.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/domain test -- run src/analytics/formatPnlHeadline.test.ts src/analytics/netExposure.test.ts`
Expected: PASS. Then `pnpm --filter @rtc/domain typecheck` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/analytics/formatPnlHeadline.ts packages/domain/src/analytics/netExposure.ts packages/domain/src/analytics/formatPnlHeadline.test.ts packages/domain/src/analytics/netExposure.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): PnL k-formatters + net exposure aggregation helper"
```

---

### Task 4: AnalyticsSimulator — PROTO-scale positions and PnL seed

**Files:**
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.ts:15-53`
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.test.ts:34-50` (pins exact basePnl values)

**Interfaces:**
- Consumes: `netExposureByCurrency` (Task 3) — in tests only, to assert the exposure targets.
- Produces: `STATIC_POSITIONS` whose per-currency aggregation is exactly EUR +15.2M, USD −22.8M, JPY +8.4M, GBP −6.1M, AUD +4.7M, CAD −3.2M, NZD +2.1M; headline PnL seeded at 17,120.

- [ ] **Step 1: Update the pinned test + add exposure-target test (failing first)**

In `AnalyticsSimulator.test.ts`, replace the exact-basePnl assertions (lines 34–50 pin 564.97 / 1382.31 / −1656.82) with:

```ts
  it("emits 9 static positions with PROTO-scale PnL", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    expect(update.currentPositions).toHaveLength(9);
    const bySymbol = new Map(
      update.currentPositions.map((p) => [p.symbol, p.basePnl]),
    );
    expect(bySymbol.get("EURUSD")).toBe(13_000);
    expect(bySymbol.get("USDJPY")).toBe(-4_000);
    expect(bySymbol.get("GBPUSD")).toBe(9_000);
    expect(bySymbol.get("AUDUSD")).toBe(6_000);
    expect(bySymbol.get("EURCAD")).toBe(-2_000);
    expect(bySymbol.get("EURJPY")).toBe(5_000);
  });

  it("static positions aggregate to the PROTO net-exposure targets", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    const exposure = netExposureByCurrency(update.currentPositions);
    expect(exposure).toEqual([
      { currency: "EUR", amountMillions: 15.2 },
      { currency: "USD", amountMillions: -22.8 },
      { currency: "JPY", amountMillions: 8.4 },
      { currency: "GBP", amountMillions: -6.1 },
      { currency: "AUD", amountMillions: 4.7 },
      { currency: "NZD", amountMillions: 2.1 },
      { currency: "CAD", amountMillions: -3.2 },
    ]);
  });

  it("PnL history starts near the PROTO seed of 17120", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    const latest = update.history[update.history.length - 1];
    // 90 random-walk steps of ±0.5% each can drift at most ~(1.005)^90 ≈ 1.57×.
    expect(latest.usdPnl).toBeGreaterThan(17_120 / 1.6);
    expect(latest.usdPnl).toBeLessThan(17_120 * 1.6);
  });
```

Import `netExposureByCurrency` from `../analytics/netExposure.js` at the top. Keep every other existing test unchanged.

- [ ] **Step 2: Run tests to verify the new pins fail**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/AnalyticsSimulator.test.ts`
Expected: FAIL — old basePnl values, random PnL start.

- [ ] **Step 3: Reseed the simulator**

Replace `STATIC_POSITIONS` (lines 15–40) with (amount design: base amounts accrue to base ccy, counter amounts to terms ccy; column sums per currency hit the PROTO targets exactly):

```ts
/**
 * PROTO-scale demo book (spec §4.4). Per-currency aggregation via
 * netExposureByCurrency() lands exactly on the PROTO bubble values
 * (dc.html L1300): EUR +15.2M, USD -22.8M, JPY +8.4M, GBP -6.1M,
 * AUD +4.7M, CAD -3.2M, NZD +2.1M. basePnl values produce the PROTO
 * per-pair bars (dc.html L1302) after formatPnlK.
 */
const STATIC_POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 13_000,
    baseTradedAmount: 6_200_000,
    counterTradedAmount: -6_800_000,
  },
  {
    symbol: "USDJPY",
    basePnl: -4_000,
    baseTradedAmount: -13_400_000,
    counterTradedAmount: 11_300_000,
  },
  {
    symbol: "GBPUSD",
    basePnl: 9_000,
    baseTradedAmount: -4_100_000,
    counterTradedAmount: 5_200_000,
  },
  {
    symbol: "GBPJPY",
    basePnl: -1_200,
    baseTradedAmount: -2_000_000,
    counterTradedAmount: 1_400_000,
  },
  {
    symbol: "EURJPY",
    basePnl: 5_000,
    baseTradedAmount: 4_000_000,
    counterTradedAmount: -4_300_000,
  },
  {
    symbol: "AUDUSD",
    basePnl: 6_000,
    baseTradedAmount: 6_000_000,
    counterTradedAmount: -6_500_000,
  },
  {
    symbol: "NZDUSD",
    basePnl: 800,
    baseTradedAmount: 2_100_000,
    counterTradedAmount: -1_300_000,
  },
  {
    symbol: "EURCAD",
    basePnl: -2_000,
    baseTradedAmount: 3_100_000,
    counterTradedAmount: -3_200_000,
  },
  {
    symbol: "EURAUD",
    basePnl: -600,
    baseTradedAmount: 1_900_000,
    counterTradedAmount: -1_300_000,
  },
];
```

In the constructor (line 53), replace the random start with the PROTO seed:

```ts
    // PROTO headline P&L seed (dc.html L816: pnl: 17120).
    this.currentPrice = 17_120;
```

Update the constructor comment accordingly (delete "Random initial value between -5000 and +5000").

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/AnalyticsSimulator.test.ts` — Expected: PASS.
Run: `pnpm --filter @rtc/domain test` — Expected: PASS (fix any other test pinning the old 564.97-style values the same way).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/simulators/AnalyticsSimulator.ts packages/domain/src/simulators/AnalyticsSimulator.test.ts
git commit -m "feat(domain): analytics simulator seeds PROTO-scale book and 17.1k PnL"
```

---

### Task 5: FX blotter seed trades

**Files:**
- Modify: `packages/domain/src/simulators/TradeStoreSimulator.ts`
- Modify: `packages/domain/src/simulators/ExecutionSimulator.ts:17,26` (`DEFAULT_TRADER_NAME`, `nextId`)
- Modify/Check: `packages/domain/src/simulators/TradeStoreSimulator.test.ts` and `TradeStoreSimulator.contract.test.ts` (pin empty start today)

**Interfaces:**
- Consumes: `Trade`, `TradeStatus`, `Direction` from `packages/domain/src/fx/trade.js` (`Trade.tradeName` IS the trader-name field — no schema change needed).
- Produces: `getTradeStream()` first snapshot = 5 seeded trades, ids 1038–1042, newest first. Live trade ids continue from 1043.

- [ ] **Step 1: Write the failing test**

Add to `TradeStoreSimulator.test.ts` (adjust imports to the file's existing style):

```ts
  it("starts with the five PROTO seed trades, newest first", async () => {
    const store = new TradeStoreSimulator(new ExecutionSimulator());
    const snapshot = await firstValueFrom(store.getTradeStream());
    expect(snapshot.map((t) => t.tradeId)).toEqual([1042, 1041, 1040, 1039, 1038]);

    const t1042 = snapshot[0];
    expect(t1042.currencyPair).toBe("EURUSD");
    expect(t1042.direction).toBe(Direction.Buy);
    expect(t1042.status).toBe(TradeStatus.Done);
    expect(t1042.notional).toBe(1_000_000);
    expect(t1042.dealtCurrency).toBe("EUR");
    expect(t1042.spotRate).toBe(1.09213);
    expect(t1042.tradeName).toBe("A.Stark");

    const t1040 = snapshot[2];
    expect(t1040.status).toBe(TradeStatus.Rejected);
    expect(t1040.tradeName).toBe("N.Romanoff");

    // value date = trade date + 2 days
    const dayMs = 86_400_000;
    for (const t of snapshot) {
      expect(
        new Date(t.valueDate).getTime() - new Date(t.tradeDate).getTime(),
      ).toBe(2 * dayMs);
    }
  });

  it("live executed trades get ids continuing from 1043", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const executed = firstValueFrom(
      engine.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.09213,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    await vi.advanceTimersByTimeAsync(2_100);
    const trade = await executed;
    expect(trade.tradeId).toBe(1043);
    expect(trade.tradeName).toBe("A.Stark");
    const snapshot = await firstValueFrom(store.getTradeStream());
    expect(snapshot).toHaveLength(6);
    vi.useRealTimers();
  });
```

If the existing tests pin an EMPTY first snapshot, update them to pin the seeded length (5) instead — the seeds ARE the new contract.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/TradeStoreSimulator.test.ts`
Expected: FAIL — snapshot is empty, ids start at 1.

- [ ] **Step 3: Implement seeds**

In `ExecutionSimulator.ts`: `DEFAULT_TRADER_NAME` becomes `"A.Stark"` (PROTO user Anthony Stark executes the demo trades) and `private nextId = 1;` becomes `private nextId = 1043;` with comment `// PROTO fxSeq (dc.html L784): live trades continue after seed ids 1038-1042.`

In `TradeStoreSimulator.ts`, add above the class:

```ts
const DAY_MS = 86_400_000;

interface SeedSpec {
  readonly tradeId: number;
  readonly status: TradeStatus;
  readonly direction: Direction;
  readonly currencyPair: string;
  readonly dealtCurrency: string;
  readonly notional: number;
  readonly spotRate: number;
  readonly tradeName: string;
  readonly daysAgo: number;
}

/** PROTO seeded FX blotter (dc.html L818/L834). Rates are the pairs' base mids. */
const SEED_TRADES: readonly SeedSpec[] = [
  { tradeId: 1042, status: TradeStatus.Done, direction: Direction.Buy, currencyPair: "EURUSD", dealtCurrency: "EUR", notional: 1_000_000, spotRate: 1.09213, tradeName: "A.Stark", daysAgo: 3 },
  { tradeId: 1041, status: TradeStatus.Done, direction: Direction.Sell, currencyPair: "USDJPY", dealtCurrency: "USD", notional: 2_000_000, spotRate: 151.203, tradeName: "A.Stark", daysAgo: 3 },
  { tradeId: 1040, status: TradeStatus.Rejected, direction: Direction.Buy, currencyPair: "GBPUSD", dealtCurrency: "GBP", notional: 500_000, spotRate: 1.26414, tradeName: "N.Romanoff", daysAgo: 4 },
  { tradeId: 1039, status: TradeStatus.Done, direction: Direction.Sell, currencyPair: "EURJPY", dealtCurrency: "EUR", notional: 1_500_000, spotRate: 165.142, tradeName: "S.Rogers", daysAgo: 5 },
  { tradeId: 1038, status: TradeStatus.Done, direction: Direction.Buy, currencyPair: "AUDUSD", dealtCurrency: "AUD", notional: 3_000_000, spotRate: 0.66121, tradeName: "B.Banner", daysAgo: 6 },
];

function isoDaysFromNow(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function seedTrade(spec: SeedSpec): Trade {
  return {
    tradeId: spec.tradeId,
    tradeName: spec.tradeName,
    currencyPair: spec.currencyPair,
    notional: spec.notional,
    dealtCurrency: spec.dealtCurrency,
    direction: spec.direction,
    spotRate: spec.spotRate,
    status: spec.status,
    tradeDate: isoDaysFromNow(-spec.daysAgo),
    valueDate: isoDaysFromNow(-spec.daysAgo + 2),
  };
}
```

In the constructor, before wiring `onTrade` (insert oldest-first so `snapshot()`'s reverse returns newest-first):

```ts
    for (const spec of [...SEED_TRADES].sort((a, b) => a.tradeId - b.tradeId)) {
      this.trades.set(spec.tradeId, seedTrade(spec));
    }
```

Import `TradeStatus` and `Direction` (value imports) from `../fx/trade.js`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/TradeStoreSimulator.test.ts src/simulators/ExecutionSimulator.test.ts` then the full `pnpm --filter @rtc/domain test`.
Expected: PASS. Any test elsewhere pinning `tradeId` 1 or trader "RTC" updates to 1043 / "A.Stark".

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/simulators/TradeStoreSimulator.ts packages/domain/src/simulators/ExecutionSimulator.ts packages/domain/src/simulators/TradeStoreSimulator.test.ts
git commit -m "feat(domain): seed PROTO FX blotter trades, ids continue from 1043"
```

---

### Task 6: Credit catalogues + seeded RFQs

**Files:**
- Modify: `packages/domain/src/credit/instrument.ts` (add `refPrice`)
- Modify: `packages/domain/src/simulators/InstrumentSimulator.ts` (replace catalogue)
- Modify: `packages/domain/src/simulators/DealerSimulator.ts` (replace catalogue)
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.ts` (seed 3 RFQs + quotes)
- Modify: matching tests (`CreditRfqSimulator.test.ts`, any test pinning catalogue contents — find with `grep -rln "Wells Fargo\|ORCL\|594918104" packages/`)

**Interfaces:**
- Consumes: `Rfq`/`RfqState` (`packages/domain/src/credit/rfq.ts`), `Quote`/`QuoteState` (`quote.ts`), `Direction`.
- Produces: `INSTRUMENTS_CATALOG` (8 PROTO instruments, ids 0–7), `DEALERS_CATALOG` (9 PROTO dealers, ids 0–8, Adaptive Bank id 0), seeded SoW with RFQs 235/237/238; `nextRfqId` starts at 240; credit blotter (client-derived from Closed+accepted RFQs) shows 2 rows.
- **Known deviation (documented):** PROTO's RFQ card list shows 2 cards (238, 237) and seeds its 2 blotter rows separately. The app derives blotter rows from Closed/accepted RFQs, so we seed RFQ **235** as Closed/accepted too — the blotter gets both PROTO rows (238 MSFT/Citi $99.8, 235 AAPL/Goldman $101.2) at the cost of a third card in the "All" RFQ list. Blotter parity wins; do not "fix" this by hardcoding blotter rows in the client.

- [ ] **Step 1: Write the failing tests**

Add to `CreditRfqSimulator.test.ts` (match existing import style; dealers for the constructor come from `DEALERS_CATALOG`):

```ts
  it("emits seeded state of the world: RFQs 235, 237, 238 with quotes", async () => {
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const events = await firstValueFrom(
      sim.events().pipe(takeWhile((e) => e.type !== "endOfStateOfTheWorld", true), toArray()),
    );
    const rfqs = events.filter((e) => e.type === "rfqCreated").map((e) => e.payload);
    expect(rfqs.map((r) => r.id).sort((a, b) => a - b)).toEqual([235, 237, 238]);

    const byId = new Map(rfqs.map((r) => [r.id, r]));
    expect(byId.get(238)?.state).toBe(RfqState.Closed);
    expect(byId.get(238)?.direction).toBe(Direction.Buy);
    expect(byId.get(238)?.quantity).toBe(3_500_000);
    expect(byId.get(237)?.state).toBe(RfqState.Cancelled);
    expect(byId.get(235)?.state).toBe(RfqState.Closed);

    const quotes = events.filter((e) => e.type === "quoteCreated").map((e) => e.payload);
    const accepted238 = quotes.find((q) => q.rfqId === 238 && q.state.type === "accepted");
    expect(accepted238?.state).toEqual({ type: "accepted", price: 99.8 });
    const accepted235 = quotes.find((q) => q.rfqId === 235 && q.state.type === "accepted");
    expect(accepted235?.state).toEqual({ type: "accepted", price: 101.2 });
    expect(quotes.filter((q) => q.rfqId === 237).every((q) => q.state.type === "passed")).toBe(true);
  });

  it("new RFQs get ids from 240 (PROTO creditSeq)", async () => {
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const id = await firstValueFrom(
      sim.createRfq({ instrumentId: 0, quantity: 1_000, direction: Direction.Buy, expirySecs: 1, dealerIds: [1] }),
    );
    expect(id).toBe(240);
  });
```

Add catalogue tests in `InstrumentSimulator`/`DealerSimulator` test files (create beside sources if absent):

```ts
// DealerSimulator.test.ts
it("carries the PROTO dealer catalogue in order, Adaptive Bank first", async () => {
  expect(DEALERS_CATALOG.map((d) => d.name)).toEqual([
    "Adaptive Bank", "Citi", "JP Morgan", "Goldman Sachs", "Morgan Stanley",
    "Barclays", "RBC", "HSBC", "Deutsche Bank",
  ]);
});

// InstrumentSimulator.test.ts
it("carries the PROTO instrument catalogue", async () => {
  expect(INSTRUMENTS_CATALOG.map((i) => [i.name, i.cusip, i.refPrice])).toEqual([
    ["AAPL 2.4 08/30", "037833DX5", 98.4],
    ["MSFT 3.3 02/27", "594918BV5", 99.8],
    ["AMZN 4.05 08/47", "023135BW5", 96.2],
    ["GOOGL 1.1 08/30", "02079KAC1", 91.5],
    ["TSLA 5.3 08/25", "88160RAG6", 100.6],
    ["UST 4.0 11/34", "91282CFP1", 98.9],
    ["VZ 4.5 08/33", "92343VGE9", 97.3],
    ["KO 1.45 06/27", "191216DA5", 93.7],
  ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/CreditRfqSimulator.test.ts src/simulators/DealerSimulator.test.ts src/simulators/InstrumentSimulator.test.ts`
Expected: FAIL — old catalogues, empty SoW, ids from 1.

- [ ] **Step 3: Implement**

`packages/domain/src/credit/instrument.ts` — add the field:

```ts
export interface Instrument {
  readonly id: number;
  readonly name: string;
  readonly cusip: string;
  readonly ticker: string;
  readonly maturity: string;
  readonly interestRate: number;
  readonly benchmark: string;
  /** PROTO reference price (dc.html L758-763); demo quote anchor. */
  readonly refPrice: number;
}
```

`InstrumentSimulator.ts` — replace `INSTRUMENTS_CATALOG` with the 8 PROTO instruments (name/cusip/refPrice verbatim from PROTO L758–763; ticker = symbol; maturity = 15th of the MM/YY month; interestRate = the coupon in the name; benchmark strings follow the existing house format):

```ts
export const INSTRUMENTS_CATALOG: readonly Instrument[] = [
  { id: 0, name: "AAPL 2.4 08/30", cusip: "037833DX5", ticker: "AAPL", maturity: "20300815", interestRate: 2.4, benchmark: "10Y UST 4.000 08/2030", refPrice: 98.4 },
  { id: 1, name: "MSFT 3.3 02/27", cusip: "594918BV5", ticker: "MSFT", maturity: "20270215", interestRate: 3.3, benchmark: "3Y UST 3.500 02/2027", refPrice: 99.8 },
  { id: 2, name: "AMZN 4.05 08/47", cusip: "023135BW5", ticker: "AMZN", maturity: "20470815", interestRate: 4.05, benchmark: "30Y UST 4.250 08/2047", refPrice: 96.2 },
  { id: 3, name: "GOOGL 1.1 08/30", cusip: "02079KAC1", ticker: "GOOGL", maturity: "20300815", interestRate: 1.1, benchmark: "10Y UST 4.000 08/2030", refPrice: 91.5 },
  { id: 4, name: "TSLA 5.3 08/25", cusip: "88160RAG6", ticker: "TSLA", maturity: "20250815", interestRate: 5.3, benchmark: "1Y UST 4.750 08/2025", refPrice: 100.6 },
  { id: 5, name: "UST 4.0 11/34", cusip: "91282CFP1", ticker: "UST", maturity: "20341115", interestRate: 4.0, benchmark: "10Y UST 4.000 11/2034", refPrice: 98.9 },
  { id: 6, name: "VZ 4.5 08/33", cusip: "92343VGE9", ticker: "VZ", maturity: "20330815", interestRate: 4.5, benchmark: "10Y UST 4.125 08/2033", refPrice: 97.3 },
  { id: 7, name: "KO 1.45 06/27", cusip: "191216DA5", ticker: "KO", maturity: "20270615", interestRate: 1.45, benchmark: "3Y UST 3.500 06/2027", refPrice: 93.7 },
];
```

`DealerSimulator.ts` — replace `DEALERS_CATALOG` (PROTO L757; `ADAPTIVE_BANK_NAME` constant already matches "Adaptive Bank" — the existing skip-auto-response rule now applies to id 0, mirroring rtc-original where Adaptive is the user's own bank):

```ts
export const DEALERS_CATALOG: readonly Dealer[] = [
  { id: 0, name: "Adaptive Bank" },
  { id: 1, name: "Citi" },
  { id: 2, name: "JP Morgan" },
  { id: 3, name: "Goldman Sachs" },
  { id: 4, name: "Morgan Stanley" },
  { id: 5, name: "Barclays" },
  { id: 6, name: "RBC" },
  { id: 7, name: "HSBC" },
  { id: 8, name: "Deutsche Bank" },
];
```

`CreditRfqSimulator.ts` — change `private nextRfqId = 1;` to `private nextRfqId = 240; // PROTO creditSeq (dc.html L784)` and `private nextQuoteId = 1;` to `private nextQuoteId = 13; // after the 12 seeded quotes`. Add at the end of the constructor: `this.seedDemoState();` and the method:

```ts
  /**
   * PROTO demo seeds (dc.html L820-821/L835): two terminal RFQ cards
   * (238 accepted, 237 cancelled) plus RFQ 235 whose accepted quote
   * produces the second credit-blotter row (blotter derives from
   * Closed+accepted RFQs — see CreditBlotter.deriveTrades).
   */
  private seedDemoState(): void {
    const DAY_MS = 86_400_000;
    const seedRfqs: readonly Rfq[] = [
      { id: 238, instrumentId: 1, quantity: 3_500_000, direction: Direction.Buy, state: RfqState.Closed, expirySecs: 120, creationTimestamp: Date.now() - 2 * DAY_MS },
      { id: 237, instrumentId: 4, quantity: 2_000_000, direction: Direction.Sell, state: RfqState.Cancelled, expirySecs: 120, creationTimestamp: Date.now() - 200_000 },
      { id: 235, instrumentId: 0, quantity: 2_000_000, direction: Direction.Sell, state: RfqState.Closed, expirySecs: 120, creationTimestamp: Date.now() - 6 * DAY_MS },
    ];
    // dealer ids: 0 Adaptive Bank, 1 Citi, 2 JP Morgan, 3 Goldman Sachs
    const seedQuotes: readonly Quote[] = [
      { id: 1, rfqId: 238, dealerId: 0, state: { type: "pendingWithPrice", price: 99.47 } },
      { id: 2, rfqId: 238, dealerId: 1, state: { type: "accepted", price: 99.8 } },
      { id: 3, rfqId: 238, dealerId: 2, state: { type: "pendingWithPrice", price: 99.54 } },
      { id: 4, rfqId: 238, dealerId: 3, state: { type: "pendingWithPrice", price: 100.27 } },
      { id: 5, rfqId: 237, dealerId: 0, state: { type: "passed" } },
      { id: 6, rfqId: 237, dealerId: 1, state: { type: "passed" } },
      { id: 7, rfqId: 237, dealerId: 2, state: { type: "passed" } },
      { id: 8, rfqId: 237, dealerId: 3, state: { type: "passed" } },
      { id: 9, rfqId: 235, dealerId: 0, state: { type: "pendingWithPrice", price: 100.9 } },
      { id: 10, rfqId: 235, dealerId: 1, state: { type: "pendingWithPrice", price: 101.4 } },
      { id: 11, rfqId: 235, dealerId: 2, state: { type: "pendingWithPrice", price: 100.7 } },
      { id: 12, rfqId: 235, dealerId: 3, state: { type: "accepted", price: 101.2 } },
    ];
    for (const rfq of seedRfqs) {
      this.rfqs.set(rfq.id, rfq);
      this.rfqQuotes.set(rfq.id, []);
    }
    for (const quote of seedQuotes) {
      this.quotes.set(quote.id, quote);
      this.rfqQuotes.get(quote.rfqId)?.push(quote.id);
    }
  }
```

Import `Direction` as a value from `../fx/trade.js`. Terminal seed states are inserted directly — no expiry scheduling for them.

- [ ] **Step 4: Run tests**

`pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain typecheck` — PASS. Then check catalogue pinners repo-wide: `grep -rln "Wells Fargo\|Citigroup\|ORCL 4.755\|594918104" packages/ --include="*.ts" --include="*.tsx"` and update each to the new catalogue (client-core/client-react/RN fixtures included; RN jest: `pnpm --filter @rtc/client-react-native test`).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/credit packages/domain/src/simulators/InstrumentSimulator.ts packages/domain/src/simulators/DealerSimulator.ts packages/domain/src/simulators/CreditRfqSimulator.ts <updated test files>
git commit -m "feat(domain): PROTO credit catalogues + seeded RFQ/blotter demo state"
```

---

### Task 7: Admin event-log seed snapshot

**Files:**
- Modify: `packages/domain/src/simulators/EventLogSimulator.ts:94-105`
- Modify: `packages/domain/src/simulators/EventLogSimulator.contract.test.ts` (+ unit test file if present)

**Interfaces:**
- Consumes: `LogEvent`, `Severity` from `../telemetry/log.js` (severities are lowercase `"info" | "warn" | "error"`; services are the `ServiceName` union — all six seed services exist in it).
- Produces: `events$()` emits the 6 PROTO seed events (oldest first, back-dated) before the live PRNG stream.

- [ ] **Step 1: Write the failing test**

```ts
  it("emits the six PROTO seed events before live events, oldest first", async () => {
    const sim = new EventLogSimulator();
    const first6 = await firstValueFrom(sim.events$().pipe(take(6), toArray()));
    expect(
      first6.map((e) => [e.severity, e.service, e.message]),
    ).toEqual([
      ["info", "kernel", "Secure enclave mounted · AES-256"],
      ["info", "execution", "Gateway handshake complete"],
      ["info", "pricing", "Subscribed 8 instruments"],
      ["error", "refdata", "Upstream timeout · retry 1/3 scheduled"],
      ["warn", "refdata", "Latency 48ms exceeds 40ms SLO"],
      ["info", "analytics", "Snapshot recomputed in 38ms"],
    ]);
    for (let i = 1; i < first6.length; i++) {
      expect(first6[i].t).toBeGreaterThanOrEqual(first6[i - 1].t);
    }
    expect(first6[0].t).toBeLessThan(Date.now());
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/domain test -- run src/simulators/EventLogSimulator.contract.test.ts` (or the unit file you added it to)
Expected: FAIL — first event is PRNG-generated.

- [ ] **Step 3: Implement**

Add above the class in `EventLogSimulator.ts`:

```ts
/** PROTO seedEvents (dc.html L796-803), oldest first, back-dated from "now". */
const SEED_EVENTS: readonly {
  severity: Severity;
  service: ServiceName;
  message: string;
  ageMs: number;
}[] = [
  { severity: "info", service: "kernel", message: "Secure enclave mounted · AES-256", ageMs: 310_000 },
  { severity: "info", service: "execution", message: "Gateway handshake complete", ageMs: 250_000 },
  { severity: "info", service: "pricing", message: "Subscribed 8 instruments", ageMs: 190_000 },
  { severity: "error", service: "refdata", message: "Upstream timeout · retry 1/3 scheduled", ageMs: 130_000 },
  { severity: "warn", service: "refdata", message: "Latency 48ms exceeds 40ms SLO", ageMs: 70_000 },
  { severity: "info", service: "analytics", message: "Snapshot recomputed in 38ms", ageMs: 10_000 },
];
```

Replace the `events$()` body:

```ts
  events$(): Observable<LogEvent> {
    return defer(() => {
      const now = Date.now();
      const seeds: LogEvent[] = SEED_EVENTS.map((s) => {
        return {
          t: now - s.ageMs,
          severity: s.severity,
          service: s.service,
          message: s.message,
        };
      });
      return concat(
        from(seeds),
        interval(500).pipe(
          map(() => {
            return this.generateEvent();
          }),
        ),
      );
    });
  }
```

Add `from` to the rxjs import. Update any contract test pinning "first event is generated"/count semantics to account for the 6 seeds.

- [ ] **Step 4: Run tests**

`pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain typecheck` — PASS.
Full inner gate before moving to client tasks: `pnpm build && pnpm test` (workspace-wide; client tests consume the new seeds — fix any client test pinning empty blotters/RFQ lists NOW: they assert the new seeded state instead, e.g. blotter contract specs expecting "No trades yet" now expect 5 rows).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/simulators/EventLogSimulator.ts <test files>
git commit -m "feat(domain): seed PROTO admin event-log snapshot before live stream"
```

---

### Task 8: Layout — fixed-width rail + `fx-positions` panel slot

**Files:**
- Modify: `packages/client-core/src/layout/layoutPort.ts` (additive `fixedPx` on split nodes)
- Modify: `packages/client-core/src/layout/defaultLayoutPort.ts` (PANEL_SPECS + FX_ROOT)
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx:216-250` (cell rendering)
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.module.css` (fixed-cell rule)
- Modify: `packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx` (register `fx-positions`)
- Create: `packages/client-react/src/ui/fx/positions/PositionsPanel.tsx` + `PositionsPanel.module.css` (skeleton — Task 9 fills it)
- Tests: layout machine/engine tests that pin FX_ROOT shape (find via `grep -rln "fx-analytics" packages/client-core packages/client-react/src packages/client-react/tests --include="*.ts*" | grep -i test`)

**Interfaces:**
- Produces: split nodes accept `readonly fixedPx?: readonly (number | undefined)[]` (parallel to `sizes`; a set entry pins that child to N css px in the split direction and removes its resize handles). New panel id `"fx-positions"` (title "Positions") rendered by `PositionsPanel`. FX right rail = fixed 360px column split of `fx-analytics` over `fx-positions`, sizes `[0.5, 0.5]`.
- Note: `layoutPort.ts` header says types are pinned by the HUD interfaces doc §5 — this is an ADDITIVE optional field; update that doc section in the same commit (`grep -rn "interfaces" docs/superpowers/specs/ | grep -i hud` to locate it; if the doc pins the type verbatim, append the new field there too).

- [ ] **Step 1: Write the failing test**

Add to the layout engine's test file (`packages/client-react/src/ui/shell/layout/engine/__tests__/InhouseLayoutEngine.smoke.test.tsx` — follow its existing render/harness pattern for state + registry props):

```tsx
  it("renders a fixed-width cell for fixedPx split children and no resize handle", () => {
    const state: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        sizes: [0.7, 0.3],
        fixedPx: [undefined, 360],
        children: [
          { kind: "panel", panelId: "a" },
          { kind: "panel", panelId: "b" },
        ],
      },
      maximized: null,
      collapsed: [],
    };
    render(harness(state)); // reuse the file's existing helper for props/registry
    const fixedCell = screen.getByTestId("panel-b").closest("[data-fixed-cell]");
    expect(fixedCell?.getAttribute("data-fixed-cell")).toBe("true");
    expect(screen.queryByTestId("handle-root-0")).toBeNull();
  });
```

And a defaultLayoutPort unit test (create `packages/client-core/src/layout/defaultLayoutPort.test.ts` if absent, else append):

```ts
  it("FX root has a fixed 360px right rail stacking analytics over positions", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const root = initial.root;
    if (root.kind !== "split") throw new Error("fx root must be a split");
    const topRow = root.children[0];
    if (topRow.kind !== "split") throw new Error("fx top row must be a split");
    expect(topRow.fixedPx).toEqual([undefined, 360]);
    const rail = topRow.children[1];
    if (rail.kind !== "split") throw new Error("rail must be a split");
    expect(rail.children).toEqual([
      { kind: "panel", panelId: "fx-analytics" },
      { kind: "panel", panelId: "fx-positions" },
    ]);
  });
```

- [ ] **Step 2: Run to verify failure**

`pnpm --filter @rtc/client-core test -- run src/layout/defaultLayoutPort.test.ts` and `pnpm --filter @rtc/client-react test:app -- run src/ui/shell/layout/engine` (use the client package's actual unit-test script — check `packages/client-react/package.json`).
Expected: FAIL — `fixedPx` unknown, `fx-positions` missing.

- [ ] **Step 3: Implement**

`layoutPort.ts` split arm gains the optional field:

```ts
  | {
      readonly kind: "split";
      readonly dir: SplitDir;
      readonly children: readonly LayoutNode[];
      readonly sizes: readonly number[];
      /** Per-child fixed size in css px along `dir`. A set entry overrides the
       * fractional size, renders flex:0 0 Npx, and suppresses adjacent resize
       * handles (like pinned). Additive to the §5 pinned contract. */
      readonly fixedPx?: readonly (number | undefined)[];
    }
```

`defaultLayoutPort.ts`:

```ts
export const PANEL_SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  "fx-rates": { id: "fx-rates", title: "Live Rates" },
  "fx-analytics": { id: "fx-analytics", title: "Analytics" },
  "fx-positions": { id: "fx-positions", title: "Positions" },
  // ... rest unchanged
};

const FX_ROOT: LayoutNode = {
  kind: "split",
  dir: "column",
  sizes: [0.78, 0.22],
  children: [
    {
      kind: "split",
      dir: "row",
      sizes: [0.7, 0.3],
      // PROTO aside: width 360px, flex 0 0 auto (measured on the deployed
      // prototype). The fixed rail is what restores the 7-across tile grid.
      fixedPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        {
          kind: "split",
          dir: "column",
          sizes: [0.5, 0.5],
          children: [
            { kind: "panel", panelId: "fx-analytics" },
            { kind: "panel", panelId: "fx-positions" },
          ],
        },
      ],
    },
    { kind: "panel", panelId: "fx-blotter" },
  ],
};
```

`InhouseLayoutEngine.tsx` cell loop (lines 205–248): compute `const childFixed = node.fixedPx?.[i];` and

- cell attrs: `data-fixed-cell={childFixed !== undefined ? "true" : "false"}`
- cell style: `childPinned ? undefined : childFixed !== undefined ? ({ "--split-fixed": `${childFixed}px` } as CSSProperties) : ({ "--split-size": String(node.sizes[i]) } as CSSProperties)` (the existing eslint-allowed custom-property pattern — keep the same disable comment style used at line 221 IF one exists there; otherwise none is needed for `--custom-property` object style since the engine already does exactly this)
- handle suppression: extend the existing pinned logic — `showHandle` additionally requires `childFixed === undefined && node.fixedPx?.[i + 1] === undefined`.

`InhouseLayoutEngine.module.css` after the pinned-cell rule:

```css
/* A fixed-px cell (PROTO's 360px FX aside): exact basis, never grows/shrinks. */
.cell[data-fixed-cell="true"] {
  flex: 0 0 var(--split-fixed);
}
```

`appPanelRegistry.tsx`: import and register

```tsx
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";
// ...
  "fx-positions": () => {
    return <PositionsPanel />;
  },
```

`PositionsPanel.tsx` skeleton (Task 9 replaces the body):

```tsx
import type { ReactElement } from "react";

import styles from "./PositionsPanel.module.css";

export function PositionsPanel(): ReactElement {
  return (
    <div data-testid="positions-panel" className={styles.panel}>
      <span className={styles.sectionLabel}>Net Exposure</span>
    </div>
  );
}
```

```css
/* PositionsPanel.module.css */
.panel {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  overflow-y: auto;
  min-height: 0;
}

.sectionLabel {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}
```

- [ ] **Step 4: Run tests**

The Step 2 commands now PASS. Then `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-react typecheck` and the UI contract tier `pnpm --filter @rtc/client-react test:ui:contract` — update any contract/layout test pinning the old two-panel FX tree (fx-analytics as direct row child) to the new rail shape.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core/src/layout packages/client-react/src/ui/shell/layout/engine packages/client-react/src/ui/fx/positions packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx <tests>
git commit -m "feat(layout): fixed 360px FX right rail with new fx-positions panel"
```

---

### Task 9: PositionsPanel — bubble cluster + ladder (and remove the d3 cluster)

**Files:**
- Modify: `packages/client-react/src/ui/fx/positions/PositionsPanel.tsx` + `PositionsPanel.module.css`
- Modify: `packages/client-react/src/ui/fx/analytics/AnalyticsPanel.tsx` (remove Positions section + `PositionBubbles` import)
- Delete: `packages/client-react/src/ui/fx/analytics/PositionBubbles.tsx` + `PositionBubbles.module.css` (moves the cluster to the new panel with PROTO layout; nothing else imports it — verify with grep)
- Modify: `packages/client-react/package.json` — remove `d3-drag`/`d3-force`/`d3-selection` (+ their `@types/*`) IF unused after the deletion: `grep -rn "d3-" packages/client-react/src` must come back empty first; run `pnpm install` after editing
- Test: `packages/client-react/tests/ui/contract/specs/fx/positions/PositionsPanel.contract.spec.ts` (new — follow the contract tier's `*.contract.spec.ts` + `react/` swap-trio conventions from neighbouring specs, e.g. the analytics ones)

**Interfaces:**
- Consumes: `useAnalytics()` from `useViewModel()` (existing hook — positions arrive on `data.currentPositions`); `netExposureByCurrency`, `aggregatePositionsByCurrency` from `@rtc/domain` (Task 3).
- Produces: `positions-panel` testid with one `data-testid="exposure-bubble-{CCY}"` per currency and one `data-testid="exposure-row-{CCY}"` ladder row.

- [ ] **Step 1: Write the failing contract spec**

Framework-neutral spec (mirror the structure of the existing analytics contract spec — same `describeContract`/world-builder helpers; the seeded world from Task 4 yields the PROTO book):

```ts
// PositionsPanel.contract.spec.ts — shape it with the tier's existing helpers.
// Contract assertions:
// 1. renders panel: getByTestId("positions-panel") with the "Net Exposure" label
// 2. one bubble per non-zero currency: EUR, USD, JPY, GBP, AUD, NZD, CAD
// 3. bubble EUR shows "+15.2M" and data-sign="pos"; USD shows "-22.8M", data-sign="neg"
// 4. bubble diameter grows with |amount|: USD bubble width > NZD bubble width
//    (read the --bubble-size custom property or offsetWidth)
// 5. ladder rows in the same order with the same amounts, amount span carries data-sign
```

- [ ] **Step 2: Run to verify failure**

`pnpm --filter @rtc/client-react test:ui:contract` — new spec FAILS (panel renders only the label).

- [ ] **Step 3: Implement**

`PositionsPanel.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import { netExposureByCurrency } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import styles from "./PositionsPanel.module.css";

/** PROTO bubble diameter (dc.html L1301): 40 + sqrt(|millions|) * 11. */
function bubbleSize(amountMillions: number): number {
  return Math.round(40 + Math.sqrt(Math.abs(amountMillions)) * 11);
}

function formatMillions(amountMillions: number): string {
  return `${amountMillions > 0 ? "+" : ""}${amountMillions.toFixed(1)}M`;
}

export function PositionsPanel(): ReactElement | null {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  if (!data) {
    return <div className={styles.loading}>Loading positions...</div>;
  }

  const exposures = netExposureByCurrency(data.currentPositions);

  return (
    <StaleIndicator stale={stale}>
      <div data-testid="positions-panel" className={styles.panel}>
        <span className={styles.sectionLabel}>Net Exposure</span>
        <div className={styles.cluster}>
          {exposures.map((e) => {
            const size = bubbleSize(e.amountMillions);
            return (
              <span
                key={e.currency}
                data-testid={`exposure-bubble-${e.currency}`}
                data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                className={styles.bubble}
                // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
                style={
                  {
                    "--bubble-size": `${size}px`,
                    "--bubble-label-size": size > 62 ? "15px" : "12px",
                  } as CSSProperties
                }
              >
                <span className={styles.bubbleRing} aria-hidden="true" />
                <span className={styles.bubbleCcy}>{e.currency}</span>
                <span className={styles.bubbleAmt}>
                  {formatMillions(e.amountMillions)}
                </span>
              </span>
            );
          })}
        </div>
        <div className={styles.ladder}>
          {exposures.map((e) => {
            return (
              <div
                key={e.currency}
                data-testid={`exposure-row-${e.currency}`}
                className={styles.ladderRow}
              >
                <span className={styles.ladderCcy}>{e.currency}</span>
                <span
                  data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                  className={styles.ladderAmt}
                >
                  {formatMillions(e.amountMillions)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </StaleIndicator>
  );
}
```

`PositionsPanel.module.css` (extends the Task 8 skeleton; PROTO L521–524, L1300–1301):

```css
.panel {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  overflow-y: auto;
  min-height: 0;
}

.loading {
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.sectionLabel {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

/* PROTO cluster: a centered flex-wrap cloud — no physics layout. */
.cluster {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 8px 0 14px;
}

.bubble {
  position: relative;
  width: var(--bubble-size);
  height: var(--bubble-size);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.bubble[data-sign="pos"] {
  background: color-mix(in srgb, var(--accent-positive) 10%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent-positive) 22%, transparent);
}

.bubble[data-sign="neg"] {
  background: color-mix(in srgb, var(--accent-negative) 10%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent-negative) 22%, transparent);
}

/* PROTO decorative spin ring (22s linear); motion gated below. */
.bubbleRing {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, currentcolor 35%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .bubbleRing {
    animation: spin 22s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.bubble[data-sign="pos"] .bubbleCcy,
.bubble[data-sign="pos"] .bubbleAmt {
  color: var(--accent-positive);
}

.bubble[data-sign="neg"] .bubbleCcy,
.bubble[data-sign="neg"] .bubbleAmt {
  color: var(--accent-negative);
}

.bubbleCcy {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--bubble-label-size);
  letter-spacing: 0.04em;
}

.bubbleAmt {
  font-family: var(--font-mono);
  font-size: 9px;
}

.ladder {
  display: flex;
  flex-direction: column;
}

.ladderRow {
  display: flex;
  justify-content: space-between;
  padding: 6px 2px;
  border-bottom: 1px solid var(--border-primary);
  font-size: 12px;
}

.ladderCcy {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-primary);
}

.ladderAmt {
  font-family: var(--font-mono);
}

.ladderAmt[data-sign="pos"] {
  color: var(--accent-positive);
}

.ladderAmt[data-sign="neg"] {
  color: var(--accent-negative);
}
```

`AnalyticsPanel.tsx`: delete the Positions `<div>` block (lines 39–42) and the `PositionBubbles` import. Then delete `PositionBubbles.tsx` + its module css; `grep -rn "PositionBubbles" packages/` must be clean (update any test importing it — its assertions move to the new contract spec). Check d3 usage and prune deps as listed in Files.

- [ ] **Step 4: Run tests**

`pnpm --filter @rtc/client-react test:ui:contract` (new spec passes; analytics specs updated for the removed section), `pnpm --filter @rtc/client-react typecheck`, `pnpm --filter @rtc/client-react lint:css`, knip/dep gates if scripted (`pnpm -w run knip` if present). If d3 deps were removed: `pnpm install` ran clean and `git add pnpm-lock.yaml`.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react/src/ui/fx packages/client-react/tests/ui/contract packages/client-react/package.json pnpm-lock.yaml
git commit -m "feat(fx): PROTO net-exposure PositionsPanel; retire d3 bubble cluster"
```

---

### Task 10: AnalyticsPanel restyle — dedup title, k-format headline, gradient area, PROTO bars

**Files:**
- Modify: `packages/client-react/src/ui/fx/analytics/AnalyticsPanel.tsx` + `AnalyticsPanel.module.css`
- Modify: `packages/client-react/src/ui/fx/analytics/PnlValue.tsx` + `PnlValue.module.css`
- Modify: `packages/client-react/src/ui/fx/analytics/PnlChart.tsx` + `PnlChart.module.css`
- Modify: `packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx` + `PairPnlBars.module.css`
- Tests: analytics contract specs + `tests/browser/{playwright,cypress}/analytics.spec.ts` (they pin `lastPosition` text format)

**Interfaces:**
- Consumes: `formatPnlHeadline`, `formatPnlK` from `@rtc/domain` (Task 3).
- Produces: `data-testid="lastPosition"` now carries `+$17.1k`-format text (e2e + contract specs updated accordingly).

- [ ] **Step 1: Update the contract spec first (failing)**

In the analytics contract spec: assert (a) NO element with the panel-internal text "Analytics" inside `analytics-panel` (the chrome header owns the title), (b) `lastPosition` matches `/^[+-]\$\d+\.\dk$/`, (c) the section label reads "Profit & Loss · Today", (d) each PnL bar value matches `/^[+-]\d+k$/`. Run the tier — FAIL.

- [ ] **Step 2: AnalyticsPanel.tsx**

- Delete line 29 (`<span className={styles.title}>Analytics</span>`) and the `.title` rule in its css — the layout chrome already titles the panel (this was the duplicated-title bug).
- Change the P&L label text to `Profit &amp; Loss · Today` (css uppercases it).
- Keep the `PnL per Currency Pair` section; the Positions section is gone (Task 9).

- [ ] **Step 3: PnlValue — PROTO headline (dc.html L508, L1299)**

```tsx
import type { ReactElement } from "react";

import { formatPnlHeadline } from "@rtc/domain";

import styles from "./PnlValue.module.css";

export function PnlValue({ value }: PnlValueProps): ReactElement {
  const sign = value >= 0 ? "pos" : "neg";

  return (
    <div data-sign={sign} className={styles.value}>
      <span className={styles.amount} data-testid="lastPosition">
        {formatPnlHeadline(value)}
      </span>
    </div>
  );
}

interface PnlValueProps {
  value: number;
}
```

`PnlValue.module.css` — replace the amount/value rules with:

```css
.value {
  margin: 3px 0 2px;
}

.value[data-sign="pos"] {
  color: var(--accent-positive);
}

.value[data-sign="neg"] {
  color: var(--accent-negative);
}

.amount {
  font-family: var(--font-logo);
  font-weight: 700;
  font-size: 32px;
  letter-spacing: 0.02em;
  text-shadow: 0 0 18px currentcolor;
}
```

(Delete the now-unused `.currency` rule; the USD prefix span is gone — PROTO's headline is just `+$17.1k` under the "· Today" label.)

- [ ] **Step 4: PnlChart — gradient area fill (PROTO L509)**

Inside the `<svg>`, before the line path, add a `<defs>` gradient + area path (the component already computes the line path; extend `buildChart` to also return `areaPath` = the same points closed to the bottom: `path + \` L${CHART_WIDTH - PADDING},${CHART_HEIGHT} L${PADDING},${CHART_HEIGHT} Z\`` when path is non-empty):

```tsx
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="currentColor"
            stopOpacity={0.32}
          />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaPath !== "" && (
        <path
          d={areaPath}
          fill="url(#pnlFill)"
          data-sign={isPositive ? "positive" : "negative"}
          className={styles.area}
        />
      )}
```

`.area` sets the gradient's currentColor by sign (gradient-token rule does not apply — these are accent tokens, not panel tokens, and SVG stop-color via currentColor is safe):

```css
.area[data-sign="positive"] {
  color: var(--accent-positive);
}

.area[data-sign="negative"] {
  color: var(--accent-negative);
}
```

Line stroke: bump `strokeWidth` to 2 and add a glow class on the existing line path (`filter: drop-shadow(0 0 5px currentcolor)` via css, coloring by the same data-sign pattern). Keep the zero-baseline dashes.

- [ ] **Step 5: PairPnlBars — PROTO metrics (L510-511, L1302)**

Keep the diverging center-line behavior and hover-precise label (working app affordances), but restyle to PROTO: symbol column 62px mono 11px muted; track height 8px radius 2px with `background: var(--bg-secondary)` (verify the token name used by neighbouring css — use the same "secondary surface" token the tile price boxes use); bar fill `box-shadow: 0 0 10px currentcolor` with sign color; value column 38px right-aligned mono 11px in sign color showing `formatPnlK(pos.basePnl)` at rest (hover keeps `formatPrecise2`). Adjust the css module values in place; swap `formatWithScale(pos.basePnl)` → `formatPnlK(pos.basePnl)`.

- [ ] **Step 6: Run tests + update e2e pins**

`pnpm --filter @rtc/client-react test:ui:contract` PASS; grep `tests/browser/*/analytics.spec.ts` for format assertions on `lastPosition`/`priceLabel-*` and update to the k-formats. `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react lint:css`.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src/ui/fx/analytics packages/client-react/tests tests/browser 2>/dev/null || git add -A
git commit -m "feat(fx): PROTO analytics panel — k-format headline, gradient area, bar metrics"
```

---

### Task 11: Panel-head content slot + FX head tabs + CHARTS chip

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx` (renderPanel + props)
- Create: `packages/client-react/src/ui/fx/fxViewContext.tsx` (shared FX view state)
- Create: `packages/client-react/src/ui/fx/liveRates/LiveRatesHead.tsx` (+ styles in a new `PanelHeadTabs.module.css` under `ui/shell/layout/engine/` for the shared tab/chip classes)
- Create: `packages/client-react/src/ui/shell/layout/engine/appHeadRegistry.tsx`
- Modify: `packages/client-react/src/ui/App.tsx` (provider + headRegistry prop)
- Modify: `packages/client-react/src/ui/fx/liveRates/LiveRatesPanel.tsx` (watchlist placeholder + remove in-body ViewToggle)
- Test: contract spec `.../specs/shell/layout/panelHeadSlot.contract.spec.ts` + FX head tabs spec

**Interfaces:**
- Consumes: `useViewModePreference()` (existing seam — `viewMode: "chart" | "price"`; the CHARTS chip toggles it; tiles already receive `showChart={viewMode === "chart"}`).
- Produces:
  - Engine prop `headRegistry?: Partial<Record<PanelId, () => ReactElement>>`; when set for a panel, its element renders in place of the title span (controls stay).
  - `FxViewProvider` + `useFxView()` context: `{ ratesTab: "rates" | "watchlist"; setRatesTab; blotterTab: "trades" | "activity"; setBlotterTab; quickFilter: string; setQuickFilter; exportCsv: () => void; setExportCsvHandler: (fn: () => void) => void }` (plain React context — Task 12 consumes the blotter half).
  - Shared css classes `.headTabs`, `.headTab` (PROTO tab style L1191), `.headChip` (PROTO chartsBtn L1257).

- [ ] **Step 1: Failing contract specs**

Engine slot spec: render the engine with `headRegistry: { a: () => <span data-testid="custom-head">X</span> }` → `custom-head` renders inside `panel-a-header`, the default title span is absent, collapse/maximize buttons remain. FX head spec: with the app-level harness, the fx-rates panel header shows tabs "Live Rates" (active, `data-active="true"`) and "Watchlist"; clicking "Watchlist" swaps the panel body to the placeholder (`data-testid="watchlist-placeholder"`, text `WATCHLIST VIEW — COMING ONLINE`); a chip `data-testid="charts-toggle"` reflects the viewMode seam (`data-active` follows it, clicking flips it and tiles' sparklines disappear — assert via the existing tile chart testid/absence).

- [ ] **Step 2: Implement the engine slot**

`InhouseLayoutEngine.tsx`: add `headRegistry` to props/SharedProps; in `renderPanel` replace the title span with:

```tsx
        {headRegistry?.[panelId] ? (
          <div className={styles.panelHeadContent}>
            {headRegistry[panelId]?.()}
          </div>
        ) : (
          <span className={styles.panelTitle}>{spec?.title ?? panelId}</span>
        )}
```

`.panelHeadContent { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; }` in the engine css.

- [ ] **Step 3: Context + head components**

`fxViewContext.tsx`: plain `createContext` + provider with `useState` for ratesTab/blotterTab/quickFilter and a `useRef` for the export handler (setExportCsvHandler stores; exportCsv invokes or no-ops). Export a `useFxView()` hook that throws outside the provider.

`PanelHeadTabs.module.css` (PROTO L1191 + L1257):

```css
.headTabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.headTab {
  padding: 9px 14px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.headTab[data-active="true"] {
  color: var(--accent-primary);
  background: var(--panel);
  border-bottom-color: var(--accent-primary);
}

.headSpacer {
  flex: 1;
}

.headChip {
  padding: 4px 11px;
  border-radius: 4px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.1em;
  margin-right: 4px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-primary);
  cursor: pointer;
}

.headChip[data-active="true"] {
  color: var(--accent-primary);
  background: var(--chip);
  border-color: var(--border-strong);
}
```

(`background: var(--chip)` uses the shorthand — gradient-token rule. Verify the exact strong-border token name via the ThemePicker css.)

`LiveRatesHead.tsx`:

```tsx
import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { useFxView } from "#/ui/fx/fxViewContext";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

export function LiveRatesHead(): ReactElement {
  const { ratesTab, setRatesTab } = useFxView();
  const { useViewModePreference } = useViewModel();
  const { viewMode, setViewMode } = useViewModePreference();
  const charts = viewMode === "chart";

  return (
    <div className={styles.headTabs}>
      <button
        type="button"
        data-testid="rates-tab-live"
        data-active={ratesTab === "rates" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setRatesTab("rates");
        }}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        data-testid="rates-tab-watchlist"
        data-active={ratesTab === "watchlist" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setRatesTab("watchlist");
        }}
      >
        ☰ Watchlist
      </button>
      <span className={styles.headSpacer} />
      <button
        type="button"
        data-testid="charts-toggle"
        data-active={charts ? "true" : "false"}
        className={styles.headChip}
        onClick={() => {
          setViewMode(charts ? "price" : "chart");
        }}
      >
        CHARTS
      </button>
    </div>
  );
}
```

`appHeadRegistry.tsx`: `export const appHeadRegistry = { "fx-rates": () => <LiveRatesHead /> }` (Task 12 adds fx-blotter). `App.tsx`: wrap `WorkspaceEngine` in `<FxViewProvider>` and pass `headRegistry={appHeadRegistry}`.

`LiveRatesPanel.tsx`: read `const { ratesTab } = useFxView();` — when `"watchlist"` render `<div data-testid="watchlist-placeholder" className={styles.placeholder}>WATCHLIST VIEW — COMING ONLINE</div>` instead of the grid; remove the in-body `<ViewToggle …/>` usage (the head chip replaces it — delete ViewToggle component + its spec if now unused, or leave if the price/chart toggle tests still route through the seam; prefer delete + update specs to click `charts-toggle`). Placeholder css: mono 11px, `color: var(--text-muted)`, centered flex, letter-spacing 0.14em.

- [ ] **Step 4: Run tests**

Contract tier + typecheck + both eslint configs. The ViewToggle-based specs/goldens update to the head chip. Expected churn is noted for Task 16's golden pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react/src
git commit -m "feat(shell): panel-head content slot; FX Live Rates/Watchlist tabs + CHARTS chip"
```

---

### Task 12: Blotter head — tabs, trade count, filter, CSV chip

**Files:**
- Create: `packages/client-react/src/ui/fx/blotter/FxBlotterHead.tsx`
- Modify: `packages/client-react/src/ui/shell/layout/engine/appHeadRegistry.tsx` (add `fx-blotter`)
- Modify: `packages/client-react/src/ui/fx/blotter/FxBlotter.tsx` (lift quickFilter to context; register export handler; Activity placeholder; drop the in-body toolbar row)
- Test: blotter head contract spec

**Interfaces:**
- Consumes: `useFxView()` (Task 11), `useTrades()` (count), existing `QuickFilter` component + `exportFxToCsv`.
- Produces: blotter header shows `▤ FX Blotter` | `⚡ Activity` tabs, `"N trades"` count, the filter input, and a `⤓ CSV` chip.

- [ ] **Step 1: Failing contract spec**

With the seeded world (Task 5 seeds): fx-blotter header renders both tabs; count reads `5 trades`; typing in the head filter narrows body rows; `⤓ CSV` chip has `data-testid="export-csv"`; clicking the Activity tab swaps the body to `data-testid="activity-placeholder"` with `ACTIVITY FEED — COMING ONLINE`.

- [ ] **Step 2: Implement**

`FxBlotterHead.tsx` — tabs (same `.headTab` classes), then when `blotterTab === "trades"`: `<span data-testid="blotter-count" className={styles.count}>{trades.length} trades</span>` (via `useTrades()`), the existing `<QuickFilter value={quickFilter} onChange={setQuickFilter} />`, and the CSV chip calling `exportCsv()` from context (keep `data-testid="export-csv"` — the existing e2e pins it). Count css: mono 10px muted, margin-right 8px.

`FxBlotter.tsx`: remove the local `quickFilter` state + the toolbar div (title/QuickFilter/export button); consume `const { quickFilter, blotterTab, setExportCsvHandler } = useFxView();`; register the export handler:

```tsx
  const processedTrades = applySortToTrades(filtered, sort);

  useEffect(() => {
    setExportCsvHandler(() => {
      exportFxToCsv(processedTrades);
    });
  }, [processedTrades, setExportCsvHandler]);
```

When `blotterTab === "activity"` render the placeholder instead of the table. Keep column sort/filter UI unchanged.

- [ ] **Step 3: Run tests**

Contract tier (blotter specs update: toolbar assertions move to the head), e2e specs that pinned the old toolbar (`grep -rn "export-csv\|Quick filter" tests/ packages/client-react/tests` and update selectors/flows), typecheck + lints.

- [ ] **Step 4: Commit**

```bash
git add -A packages/client-react/src packages/client-react/tests tests 2>/dev/null || git add -A
git commit -m "feat(fx): blotter head tabs with live count, filter and CSV chip"
```

---

### Task 13: Header chrome — nav pill, hexagon avatar, language menu

**Files:**
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.module.css` (`.navButton` block, avatar/lang additions)
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx` (mount LanguageMenu before the divider)
- Create: `packages/client-react/src/ui/shell/chrome/LanguageMenu.tsx`
- Modify: `packages/client-react/src/ui/shell/chrome/AccountMenu.tsx` (hexagon avatar trigger; identity rows; language select removed)
- Modify: `packages/client-core/src/presenters/SessionPresenter.ts` (SessionUser gains `email`, `desk`, `clearance`)
- Tests: chrome contract specs + `SessionPresenter` test

**Interfaces:**
- Produces: `SessionUser` gains `readonly email: string; readonly desk: string; readonly clearance: string;` — `DEMO_USER` values below. All `SessionUser` literals repo-wide (tests, RN fakes, harnesses) must add the three fields: find with `grep -rln "initials" packages/ --include="*.ts*" | xargs grep -ln "TRD-0042\|SessionUser"`.

- [ ] **Step 1: Failing specs**

Chrome contract spec additions: (a) each nav tab renders uppercase (assert computed `text-transform` or the label + css class); active tab has `data-active="true"` styled as outlined chip (assert class, not pixels); (b) `language-toggle` button opens a menu listing EN/中文/日本/DE/FR/ES and selecting one updates the trigger label (decorative); (c) account panel shows email `a.stark@reactivetrader.io`, desk `G10 Spot · London`, clearance `LEVEL 4 · FULL`.

- [ ] **Step 2: Nav pill (PROTO navStyle L1188)**

Replace the `.navButton` rules:

```css
.navButton {
  padding: 7px 12px;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  color: var(--text-muted);
  background: transparent;
  transition: all 0.2s;
}

.navButton[data-active="true"] {
  color: var(--accent-primary);
  background: var(--chip);
  border-color: var(--border-strong);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-primary) 25%, transparent);
}
```

(Note the old active rule used `background-color: var(--accent-primary)` — the replacement uses the `background:` shorthand with `--chip`, per the gradient-token rule. Verify `--border-strong` is the repo's actual strong-border token; adjust to the real name.)

- [ ] **Step 3: SessionPresenter identity (PROTO L789, L204-219)**

```ts
export interface SessionUser {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
  readonly email: string;
  readonly desk: string;
  readonly clearance: string;
}

export const DEMO_USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};
```

Fix every literal the typecheck now flags (client-react tests, contract/visual harness worlds, RN fakes — run `pnpm typecheck` at the root and let the compiler enumerate them).

- [ ] **Step 4: AccountMenu + LanguageMenu**

AccountMenu: trigger avatar becomes the PROTO hexagon — inline SVG `<polygon points="15,2 27,9 27,21 15,28 3,21 3,9">` (30×30) with a css class (`fill` must NOT use `--chip`: use `fill: color-mix(in srgb, var(--accent-primary) 12%, transparent)` like LockScreen's `avatarChip`, stroke `var(--accent-primary)`, `filter: drop-shadow(0 0 6px var(--accent-primary))`), initials centered via `<text>` or an absolutely-positioned span. Dropdown gains rows (reuse `.accountMeta` pattern): EMAIL `user.email`, DESK `user.desk`, CLEARANCE `user.clearance`. Remove the `langRow` block + `LANGUAGES` const (moves to LanguageMenu).

`LanguageMenu.tsx`: same menuAnchor/dropdown pattern as AccountMenu; trigger = globe glyph `🌐`-free SVG or text `EN ▾` with `data-testid="language-toggle"`; local `useState` for the selected code; options `["EN", "中文", "日本", "DE", "FR", "ES"]` with labels `English / 中文 (简体) / 日本語 / Deutsch / Français / Español` (PROTO L790); selecting sets the trigger label — decorative, no port (keep the DECORATIVE comment convention from the old AccountMenu block). Mount in HeaderChrome between NotificationsMenu-gear and the divider.

- [ ] **Step 5: Verify LIVE/PROD badges against PROTO (no change expected)**

The existing `.live`/`.liveDot`/`.liveLabel` rules already match PROTO L149-152 (7px positive dot with glow, 10px 0.16em label). Compare `EnvBadge`'s css against PROTO L153 (mono 9px weight 600, positive border + text, padding 3px 6px, radius 3px) and align any value that differs — report "no change" if they already match.

- [ ] **Step 6: Run tests + commit**

Contract tier, `pnpm typecheck` (workspace-wide — SessionUser consumers), RN jest if RN builds fake users (`pnpm --filter @rtc/client-react-native test`), lints.

```bash
git add -A packages/client-react/src packages/client-core/src packages/client-react/tests
git commit -m "feat(chrome): PROTO nav pill, hexagon avatar identity, language menu"
```

---

### Task 14: Boot log lines

**Files:**
- Modify: `packages/client-react/src/ui/shell/boot/BootSequence.tsx`
- Modify: `packages/client-react/src/ui/shell/boot/BootSequence.module.css`
- Test: `packages/client-react/src/ui/shell/boot/BootSequence.test.tsx`

**Interfaces:**
- Consumes: `useBootSequence` state — `state.progress` is a 0–100 ramp over `BOOT_DURATION_MS = 4200` (`packages/client-core/src/presenters/BootSequenceMachine.ts:15` — same duration as PROTO). **No ViewModel change**: line visibility derives from progress, so no new timers and the reduced-motion/golden path stays deterministic.

- [ ] **Step 1: Failing test**

```tsx
  it("reveals boot log lines as progress advances and all when done", () => {
    // harness renders BootSequence with a fake useBootSequence state -- follow
    // the file's existing pattern for stubbing the seam.
    // progress 0  -> 0 lines visible
    // progress 50 -> lines 0-3 visible (thresholds 9, 20, 32, 43, 55, 66, 77)
    // progress 100 -> all 7 lines, final line has data-online="true"
  });
```

Assert line text verbatim (see Step 2 array) via `screen.getByText`.

- [ ] **Step 2: Implement**

Add above the component:

```tsx
/** PROTO bootMessages (dc.html L785-788), verbatim. */
const BOOT_LOG_LINES = [
  "BOOT> initializing kernel ............ OK",
  "BOOT> mounting secure enclave ........ OK",
  "NET > linking pricing engine ......... OK",
  "NET > credit rfq gateway ............. OK",
  "NET > equities market data ........... OK",
  "SYS > calibrating HUD shaders ........ OK",
  "SYS > all systems nominal ▸ ONLINE",
] as const;

/** PROTO staggering (L908: 350 + i*480 ms over DUR 4200) expressed as progress
 * thresholds, so visibility derives from the existing ramp — no new timers. */
function visibleLineCount(progress: number): number {
  let count = 0;
  for (let i = 0; i < BOOT_LOG_LINES.length; i++) {
    if (progress >= ((350 + i * 480) / 4200) * 100) count++;
  }
  return count;
}
```

Between the subtitle div and the progress row, render:

```tsx
        <div data-testid="boot-log" className={styles.log}>
          {BOOT_LOG_LINES.slice(0, visibleLineCount(state.progress)).map(
            (line, i) => {
              return (
                <div
                  key={line}
                  data-online={i === BOOT_LOG_LINES.length - 1 ? "true" : "false"}
                  className={styles.logLine}
                >
                  {line}
                </div>
              );
            },
          )}
        </div>
```

CSS (PROTO L71-72; the container is fixed-height so the layout doesn't jump as lines appear):

```css
.log {
  width: 100%;
  height: 148px;
  overflow: hidden;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.85;
  color: var(--text-muted);
}

.logLine[data-online="true"] {
  color: var(--accent-positive);
  font-weight: 700;
}
```

Reduced-motion arm: none needed beyond what exists — under reduced motion the goldens capture the boot at a pinned progress state; since visibility is a pure function of progress, the same progress always renders the same lines. Verify the `boot/chrome` golden scenario pins `progress` (check `tests/ui/visual/shared/scenarios.ts`) — if it pins 100 or a fixed value, the render is deterministic by construction.

- [ ] **Step 3: Run tests + commit**

`pnpm --filter @rtc/client-react test:app -- run src/ui/shell/boot` + typecheck + lints.

```bash
git add packages/client-react/src/ui/shell/boot
git commit -m "feat(boot): PROTO boot-log lines derived from the progress ramp"
```

---

### Task 15: Tile nits + status-bar P&L value

**Files:**
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TileHeader.tsx` + `TileHeader.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TileChart.tsx`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TileNotional.module.css:33`
- Modify: `packages/client-react/src/ui/shell/status/CosmeticMetrics.tsx:42`
- Tests: tile contract/unit specs pinning header markup (grep `pairRow`)

- [ ] **Step 1: Pair title — tight-left group (PROTO L373: one 15px 600 string, badge right)**

`TileHeader.tsx`: wrap the three name spans:

```tsx
      <div className={styles.pairRow}>
        <span className={styles.pairName}>
          <span>{base}</span>
          <span className={styles.separator}>/</span>
          <span>{terms}</span>
        </span>
        {movementPips !== null && (
          /* badge unchanged */
        )}
      </div>
```

`TileHeader.module.css`: keep `.pairRow` `justify-content: space-between` (name left, badge right) and add:

```css
.pairName {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
```

- [ ] **Step 2: Sparkline opacity (PROTO L412: stroke-width 1.5, opacity 0.75)**

`TileChart.tsx`: add `opacity={0.75}` to the `<path>` (attribute, not style prop). Stroke width stays 1.5; sign color stays.

- [ ] **Step 3: Notional alignment (PROTO L1286: default/left)**

`TileNotional.module.css` line 33: `text-align: right;` → `text-align: left;`.

- [ ] **Step 4: Status-bar P&L (PROTO pnlStr)**

`CosmeticMetrics.tsx` line 42: `value: "+17,120"` → `value: "+$17.1k"` (matches the Task 4 seed through `formatPnlHeadline`; the readout is decorative-static by design — keep it a literal).

- [ ] **Step 5: Run tests + commit**

Tile specs + contract tier + status spec (update any "+17,120" pin), lints.

```bash
git add packages/client-react/src/ui/fx/liveRates/tile packages/client-react/src/ui/shell/status <tests>
git commit -m "feat(fx): tile title/sparkline/notional PROTO details; k-format status P&L"
```

---

### Task 16: Full gates, golden regeneration, acceptance evidence

**Files:**
- Modify: `packages/client-react/tests/ui/visual/shared/scenarios.ts` (new `positions/*` scenarios)
- Regenerate: both golden sets, all three tiers

- [ ] **Step 1: Add positions scenarios**

Follow the existing `analytics/*` scenario entries: add `positions/populated` (seeded world), `positions/negative` (world where USD dominates negative), `positions/empty` (no positions). Same harness/fixture style as the analytics ones.

- [ ] **Step 2: Local gauntlet**

From the worktree root, in order; every step must pass before the next:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-react test:ui:contract:coverage   # ≥95% gate — CI enforces it
pnpm biome ci . || pnpm exec biome ci .
pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css
```

(Use the repo's actual root script names — check the root `package.json`; run eslint IN the worktree, not the primary checkout, to avoid sibling-worktree glob pollution.)

- [ ] **Step 3: Regenerate goldens — BOTH sets, all tiers**

Follow the recipe in the visual-goldens topic doc (`packages/client-react/tests/ui/visual/` README or the scripts in `packages/client-react/package.json`, `test:ui:visual*`): regenerate the local set (`react-local/<arch>/`) for all three tiers, review the diffs image-by-image (expected churn: analytics, app/fx*, chrome/header, boot/chrome, tile/*, live-rates/*, layout/fx*, status/bar; NEW positions/*; anything OUTSIDE that list needs an explanation before proceeding), commit; the CI x86 `react/` set regenerates via the repo's established CI flow — push the branch and follow the golden-update workflow used by PR #88/#94.

- [ ] **Step 4: Acceptance screenshots**

`PORT=3210 pnpm dev`, then capture the FX screen (dark, classic + holo3d) and compare side-by-side against the deployed prototype (rtc-clone-cd-proto.vercel.app): realistic rates on tiles, 5 blotter rows with trader names, 360px two-panel rail with non-overlapping bubbles, `+$17.1k` headline, uppercase nav with outlined pill, head tabs on Live Rates + Blotter, boot log during startup. Save captures for the review package.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(visual): positions scenarios + regenerated goldens for fidelity slice"
```

---

## Execution notes for the controller

- Tasks 1→7 are domain-sequential (each builds on the previous); Tasks 8→15 are client-side and mostly independent of each other but all depend on Tasks 1–7 being merged into the branch (seeded worlds feed the contract specs). Run them in order — no parallel implementers.
- After Task 7, run the workspace-wide `pnpm build && pnpm test` catch-up (Task 7 Step 4) BEFORE dispatching Task 8 — client tests consume the seeds.
- Golden regeneration (Task 16) happens ONCE at the end, not per-task; per-task steps run unit/contract tiers only.
- The final whole-branch review must check: verbatim transcription of every PROTO value in this plan; gradient-token rule on every new `background:`/fill; cross-skin legibility of the new panels (holo3d/terminal3d/neon, light + dark).
