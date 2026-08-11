import type { HistoricPosition, PositionUpdates } from "@rtc/domain";

import { MINUTE_MS, PINNED_NOW_MS } from "./pinnedClock";
import type { AnalyticsSlice } from "./sliceTypes";

/**
 * Analytics: `useAnalytics()` / `useAnalyticsStaleFlag()`.
 *
 * `analytics/dashboard` mounts `AnalyticsDashboardFixture`
 * (`tests/visual/fixtures.tsx`), which today passes a LITERAL `PositionUpdates`
 * straight to `AnalyticsDashboard` as a prop — it never reads `useAnalytics()`
 * or `useAnalyticsStaleFlag()` at all, because `AnalyticsScreen` (the seam's
 * only reader) owns the loading/stale chrome around the dashboard and the
 * fixture mounts the dashboard leaf directly, mirroring `BootSceneFixture`.
 * This slice is therefore currently unread by the golden. It still has to be
 * a fully correct, populated book: if the fixture is ever simplified to
 * render `AnalyticsScreen` over the seam instead of `AnalyticsDashboard` over
 * a literal prop, this is the data it would pick up, and a `null` or
 * empty-history value here would silently swap a populated dashboard golden
 * for a blank "Loading analytics…" one.
 *
 * `currentPositions` reuses `AnalyticsSimulator`'s own `STATIC_POSITIONS` book
 * (`packages/domain/src/simulators/AnalyticsSimulator.ts`) verbatim: it is the
 * demo book calibrated against the prototype's published bubble/bar figures,
 * covers every currency pair the FX side trades, and already spans both
 * signs (five pairs positive, four negative). `STATIC_POSITIONS` itself is
 * module-private, so the values are restated here rather than imported.
 *
 * `history` is 12 points, 10 minutes apart, ending at `PINNED_NOW_MS` — the
 * same cadence shape `AnalyticsSimulator` builds its 90-point seed history in
 * (`new Date(now - i * TIME_STEP_MS).toISOString()`), just spaced out and
 * shortened for a fixture. Every timestamp is `new Date(<fixed ms>)
 * .toISOString()`, matching the exact format (including the `.000` millis
 * `toISOString()` always emits) the real simulator writes into
 * `HistoricPosition.timestamp` — never a hand-typed string that could drift
 * from that format unnoticed.
 */
export const analyticsSlice: AnalyticsSlice = {
  useAnalytics: () => {
    return PINNED_POSITION_UPDATES;
  },
  useAnalyticsStaleFlag: () => {
    return false;
  },
};

/** 10 minutes, in ms — the spacing between `PINNED_HISTORY` points. */
const HISTORY_STEP_MS: number = 10 * MINUTE_MS;

/** How many points precede the most recent (`PINNED_NOW_MS`) one. */
const HISTORY_POINT_COUNT: number = 12;

/** One `usdPnl` reading per `PINNED_HISTORY` point, oldest first — a hand-
 * picked walk (never `Math.random`) with enough shape (a dip at index 2, a
 * bigger one at index 8) to draw a real line rather than a straight ramp. */
const PINNED_USD_PNL_STEPS: readonly number[] = [
  8_400, 9_600, 8_900, 10_700, 12_300, 11_600, 13_800, 15_200, 14_100, 16_400,
  17_900, 16_600,
];

const PINNED_HISTORY: readonly HistoricPosition[] = Array.from(
  { length: HISTORY_POINT_COUNT },
  (_, index): HistoricPosition => {
    const stepsBack = HISTORY_POINT_COUNT - 1 - index;
    return {
      timestamp: new Date(
        PINNED_NOW_MS - stepsBack * HISTORY_STEP_MS,
      ).toISOString(),
      usdPnl: PINNED_USD_PNL_STEPS[index],
    };
  },
);

/**
 * Verbatim restatement of `AnalyticsSimulator`'s `STATIC_POSITIONS` (see this
 * module's header comment). Five pairs positive, four negative.
 */
const PINNED_CURRENT_POSITIONS: PositionUpdates["currentPositions"] = [
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

/** Frozen module-level snapshot: same reference on every `useAnalytics()`
 * call, so `toBe` identity holds across renders and instances. */
const PINNED_POSITION_UPDATES: PositionUpdates = {
  currentPositions: PINNED_CURRENT_POSITIONS,
  history: PINNED_HISTORY,
};
