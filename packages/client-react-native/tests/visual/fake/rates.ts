import type {
  NotionalView,
  TileExecutionIntents,
  TileExecutionState,
} from "@rtc/client-core";
import {
  type CurrencyPair,
  calculateSpread,
  type Price,
  PriceMovementType,
  type PriceTick,
} from "@rtc/domain";

import { PINNED_NOW_MS } from "./pinnedClock";
import type { RatesSlice } from "./sliceTypes";

/**
 * The real FX simulator roster — verbatim copy of
 * `packages/domain/src/fx/currencyPair.ts`'s `KNOWN_CURRENCY_PAIRS`, not an
 * import of it. A literal copy keeps this fixture's frozen `Price` records
 * (derived below from each pair's own `baseMid`/`typicalSpreadPips`) immune
 * to a future domain-roster edit silently reshaping a golden with no visual
 * review — the whole point of a *fake* ViewModel is that its data is chosen
 * here, not inherited live from production.
 */
const CURRENCY_PAIRS: readonly CurrencyPair[] = [
  {
    symbol: "EURUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "USD",
    defaultNotional: 1_000_000,
    baseMid: 1.09213,
    typicalSpreadPips: 1.4,
  },
  {
    symbol: "USDJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "USD",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 151.203,
    typicalSpreadPips: 1.6,
  },
  {
    symbol: "GBPUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "GBP",
    terms: "USD",
    defaultNotional: 1_000_000,
    baseMid: 1.26414,
    typicalSpreadPips: 1.8,
  },
  {
    symbol: "GBPJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "GBP",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 191.085,
    typicalSpreadPips: 2.6,
  },
  {
    symbol: "EURJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "EUR",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 165.142,
    typicalSpreadPips: 2.1,
  },
  {
    symbol: "AUDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "AUD",
    terms: "USD",
    defaultNotional: 1_000_000,
    baseMid: 0.66121,
    typicalSpreadPips: 2.0,
  },
  {
    symbol: "NZDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "NZD",
    terms: "USD",
    defaultNotional: 10_000_000,
    baseMid: 0.61054,
    typicalSpreadPips: 2.4,
  },
  {
    symbol: "EURCAD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "CAD",
    defaultNotional: 1_000_000,
    baseMid: 1.49385,
    typicalSpreadPips: 2.2,
  },
  {
    symbol: "EURAUD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "AUD",
    defaultNotional: 1_000_000,
    baseMid: 1.65172,
    typicalSpreadPips: 2.0,
  },
];

/** Per-pair movement, chosen so the golden covers all three arrows rather
 * than pinning one. Keyed by symbol, same order as `CURRENCY_PAIRS`. */
const MOVEMENT_BY_SYMBOL: Readonly<Record<string, PriceMovementType>> = {
  EURUSD: PriceMovementType.UP,
  USDJPY: PriceMovementType.DOWN,
  GBPUSD: PriceMovementType.NONE,
  GBPJPY: PriceMovementType.UP,
  EURJPY: PriceMovementType.DOWN,
  AUDUSD: PriceMovementType.NONE,
  NZDUSD: PriceMovementType.UP,
  EURCAD: PriceMovementType.DOWN,
  EURAUD: PriceMovementType.NONE,
};

/** The value date every price fixture shares — two spot days past the
 * pinned instant, matching real spot-settlement convention closely enough
 * for a static golden (the exact offset is not asserted anywhere). Derived
 * from `PINNED_NOW_MS` via `Date.UTC`-backed arithmetic, not a clock read. */
const VALUE_DATE = new Date(PINNED_NOW_MS + 2 * 86_400_000)
  .toISOString()
  .slice(0, 10);

/** Build one pair's frozen `Price` — bid/ask split symmetrically around
 * `baseMid` by half of `typicalSpreadPips` (converted to price units via
 * `pipsPosition`), then `spread` is derived from that SAME bid/ask via the
 * real domain `calculateSpread`, so a tile's spread chip always agrees with
 * its own bid and ask by construction. */
function buildPrice(
  pair: CurrencyPair,
  movementType: PriceMovementType,
): Price {
  const halfSpreadUnits =
    pair.typicalSpreadPips / (2 * 10 ** pair.pipsPosition);

  const bid = Number(
    (pair.baseMid - halfSpreadUnits).toFixed(pair.ratePrecision),
  );

  const ask = Number(
    (pair.baseMid + halfSpreadUnits).toFixed(pair.ratePrecision),
  );
  const mid = Number(((bid + ask) / 2).toFixed(pair.ratePrecision));

  return Object.freeze({
    symbol: pair.symbol,
    bid,
    ask,
    mid,
    valueDate: VALUE_DATE,
    creationTimestamp: PINNED_NOW_MS,
    movementType,
    spread: calculateSpread(bid, ask, pair.pipsPosition, pair.ratePrecision),
  });
}

/** One frozen `Price` per pair, keyed by symbol — built once at module load
 * so `usePrice` returns the identical object on every call for a given
 * pair (`toBe`), and a different object for a different pair. */
const PRICES: Readonly<Record<string, Price>> = Object.freeze(
  Object.fromEntries(
    CURRENCY_PAIRS.map((pair) => {
      const movementType =
        MOVEMENT_BY_SYMBOL[pair.symbol] ?? PriceMovementType.NONE;
      return [pair.symbol, buildPrice(pair, movementType)];
    }),
  ),
);

/** Build one pair's frozen price-history series — three ticks spaced a
 * minute apart, ending at that pair's current (module-level) price so the
 * series is internally consistent with `PRICES` above. */
function buildHistory(pair: CurrencyPair): readonly PriceTick[] {
  const current = PRICES[pair.symbol];
  const step = pair.typicalSpreadPips / 10 ** pair.pipsPosition;
  const minuteMs = 60_000;

  const earlier: PriceTick = Object.freeze({
    symbol: pair.symbol,
    bid: Number((current.bid - 2 * step).toFixed(pair.ratePrecision)),
    ask: Number((current.ask - 2 * step).toFixed(pair.ratePrecision)),
    mid: Number((current.mid - 2 * step).toFixed(pair.ratePrecision)),
    valueDate: VALUE_DATE,
    creationTimestamp: PINNED_NOW_MS - 2 * minuteMs,
  });

  const middle: PriceTick = Object.freeze({
    symbol: pair.symbol,
    bid: Number((current.bid - step).toFixed(pair.ratePrecision)),
    ask: Number((current.ask - step).toFixed(pair.ratePrecision)),
    mid: Number((current.mid - step).toFixed(pair.ratePrecision)),
    valueDate: VALUE_DATE,
    creationTimestamp: PINNED_NOW_MS - minuteMs,
  });

  const latest: PriceTick = Object.freeze({
    symbol: current.symbol,
    bid: current.bid,
    ask: current.ask,
    mid: current.mid,
    valueDate: current.valueDate,
    creationTimestamp: current.creationTimestamp,
  });

  return Object.freeze([earlier, middle, latest]);
}

/** One frozen three-tick series per pair, keyed by symbol. */
const PRICE_HISTORY: Readonly<Record<string, readonly PriceTick[]>> =
  Object.freeze(
    Object.fromEntries(
      CURRENCY_PAIRS.map((pair) => {
        return [pair.symbol, buildHistory(pair)];
      }),
    ),
  );

const EMPTY_HISTORY: readonly PriceTick[] = Object.freeze([]);

/** Shared no-op for every intent below — screenshots never press buttons.
 * Zero-arg, so it is assignable to any of the wider intent signatures
 * (`execute(direction, price, notional)`, `change(input)`, …); TS permits a
 * function with fewer declared parameters where more are expected. */
function noop(): void {}

type TileExecutionResult = { state: TileExecutionState } & TileExecutionIntents;

/** The idle arm every tile starts in — no ceremony (started/tooLong/
 * finished/timeout) is captured by the `rates/grid` scenario, which only
 * ever mounts the resting grid. */
const TILE_EXECUTION_READY: TileExecutionResult = Object.freeze({
  state: Object.freeze({ status: "ready" }),
  execute: noop,
  dismiss: noop,
});

/** Format a raw notional the same way the real `NotionalMachine` does
 * (`packages/client-core/src/presenters/NotionalMachine.ts`'s
 * `formatWithCommas`): `en-US` grouping, zero fraction digits. Deliberately
 * NOT memoized to a single frozen constant like `PRICES`/`TILE_EXECUTION_READY`
 * above — `useNotional` is called with a caller-supplied notional
 * (`TradeTicketSheet` passes `pair.defaultNotional`, which varies by pair:
 * 1,000,000 or 10,000,000 in this roster), so there is no single fixed value
 * to freeze. The formula is pure and deterministic, so repeat calls with the
 * same argument are structurally identical even though not the same object. */
function buildNotionalView(defaultNotional: number): NotionalView {
  return {
    displayValue: defaultNotional.toLocaleString("en-US", {
      maximumFractionDigits: 0,
      useGrouping: true,
    }),
    numericValue: defaultNotional,
    error: null,
    isRfq: false,
    isDefault: true,
  };
}

export const ratesSlice: RatesSlice = {
  useCurrencyPairs: () => {
    return CURRENCY_PAIRS;
  },
  useNotional: (defaultNotional: number) => {
    const state: NotionalView = buildNotionalView(defaultNotional);
    return { state, change: noop, reset: noop };
  },
  usePrice: (pair: CurrencyPair) => {
    return PRICES[pair.symbol] ?? null;
  },
  usePriceHistory: (symbol: string) => {
    return PRICE_HISTORY[symbol] ?? EMPTY_HISTORY;
  },
  useRowHighlight: () => {
    return false;
  },
  useStaleFlag: () => {
    return false;
  },
  useTileExecution: () => {
    return TILE_EXECUTION_READY;
  },
};
