import type { ActivityEntry } from "@rtc/client-core";
import {
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { DAY_MS, MINUTE_MS, PINNED_NOW_MS } from "./pinnedClock";
import type { BlotterSlice } from "./sliceTypes";

/**
 * FX spot settlement convention (T+2) — mirrors
 * `SPOT_VALUE_DATE_OFFSET_DAYS` in `packages/domain/src/fx/trade.ts`, which
 * `TradeStoreSimulator`'s seed trades derive `valueDate` from. Not imported:
 * the constant is internal to the domain package (not re-exported from
 * `@rtc/domain`'s public surface), so it is restated here as a literal,
 * documented pointer back to the source of truth rather than a guess.
 */
const SPOT_VALUE_DATE_OFFSET_DAYS = 2;

/**
 * The ISO (YYYY-MM-DD) date `daysOffset` away from `PINNED_NOW_MS` — the
 * fake's replacement for `isoDaysFromNow` (`packages/domain/src/fx/trade.ts`),
 * which the real `TradeStoreSimulator`/`ExecutionSimulator` use to derive
 * `tradeDate`/`valueDate` from a captured instant. `toISOString()` is a pure
 * function of the ms value it's given — not a clock read — so calling it on
 * the fixed `PINNED_NOW_MS` stays reproducible regardless of the machine's
 * local timezone (unlike `Date#getHours()` and friends, which read the host's
 * offset). This is the exact defect T32 found: the blotter golden re-dated
 * itself every calendar day because its dates came from `Date.now()`.
 */
function isoDateAt(daysOffset: number): string {
  return new Date(PINNED_NOW_MS + daysOffset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The wall-clock `HH:MM:SS` reading `offsetMs` away from `PINNED_NOW_MS` — the
 * fake's replacement for `BlotterPresenter`'s `formatClockTime`, which stamps
 * each `ActivityEntry.time` from `Date.now()` in the live app
 * (`packages/client-core/src/presenters/BlotterPresenter.ts`). That helper
 * reads local `getHours()`/`getMinutes()`/`getSeconds()`, which is exactly
 * what a capture must NOT depend on (a fixture reproduced on a differently
 * -zoned machine would render a different clock reading). `toISOString()`'s
 * `HH:MM:SS` slice is UTC-fixed and zero-padded the same way `formatClockTime`
 * pads with `pad2`, so the rendered text has the identical shape without the
 * host-timezone dependency.
 */
function timeOfDayAt(offsetMs: number): string {
  return new Date(PINNED_NOW_MS + offsetMs).toISOString().slice(11, 19);
}

/** The one trade attributed to `DEFAULT_TRADER_NAME` ("You") — the domain's
 * own distinction for which trades a live session's Activity feed carries
 * (see `ACTIVITY` below and `BlotterPresenter.activity$`'s doc). Named
 * separately, rather than indexed out of `TRADES`, so `ACTIVITY` references
 * it directly instead of an easily-miscounted array position. The other five
 * trades below keep distinct historical trader names, mirroring
 * `TradeStoreSimulator`'s seeded rows, and correctly never appear in
 * activity. Buy/Rejected — a rejected trade surfacing in the Activity feed is
 * a legitimate, worthwhile state to render, and it's also the one
 * Direction/TradeStatus combination `TRADES`' other five entries don't
 * already cover (see the table on `TRADES`'s own doc). */
const LIVE_TRADE: Trade = {
  tradeId: 4206,
  tradeName: DEFAULT_TRADER_NAME,
  currencyPair: "USDCAD",
  notional: 900_000,
  dealtCurrency: "USD",
  direction: Direction.Buy,
  spotRate: 1.36845,
  status: TradeStatus.Rejected,
  tradeDate: isoDateAt(0),
  valueDate: isoDateAt(0 + SPOT_VALUE_DATE_OFFSET_DAYS),
};

/**
 * Six trades covering exactly the six `Direction` × `TradeStatus`
 * combinations `TradeRow` styles distinctly (Buy/Sell direction subline
 * colour; Done/Pending/Rejected status pill colour) — one trade per
 * combination, no repeats:
 *
 * | id   | direction | status   |
 * |------|-----------|----------|
 * | 4201 | Buy       | Done     |
 * | 4202 | Sell      | Done     |
 * | 4203 | Buy       | Pending  |
 * | 4204 | Sell      | Rejected |
 * | 4205 | Sell      | Pending  |
 * | 4206 | Buy       | Rejected | (= `LIVE_TRADE`)
 *
 * `blotter.test.tsx` asserts this table exactly (the full 6-element set of
 * `direction/status` pairs) — not merely "more than one of each", which a
 * roster with duplicated combinations (and therefore missing ones) could
 * still satisfy. Currency pairs, notionals and spot rates mirror
 * `TradeStoreSimulator`'s own seed roster in realism (major pairs, seven
 * -figure notionals, plausible mid rates) without reusing its literal
 * trade ids, so this fixture reads as its own roster rather than a copy.
 *
 * `tradeDate`/`valueDate` are derived from `PINNED_NOW_MS` via `isoDateAt`,
 * never from a clock — see that function's doc for why (T32).
 */
const TRADES: readonly Trade[] = [
  {
    tradeId: 4201,
    tradeName: "A.Stark",
    currencyPair: "EURUSD",
    notional: 1_250_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.08752,
    status: TradeStatus.Done,
    tradeDate: isoDateAt(-5),
    valueDate: isoDateAt(-5 + SPOT_VALUE_DATE_OFFSET_DAYS),
  },
  {
    tradeId: 4202,
    tradeName: "N.Romanoff",
    currencyPair: "USDJPY",
    notional: 2_000_000,
    dealtCurrency: "USD",
    direction: Direction.Sell,
    spotRate: 151.48,
    status: TradeStatus.Done,
    tradeDate: isoDateAt(-5),
    valueDate: isoDateAt(-5 + SPOT_VALUE_DATE_OFFSET_DAYS),
  },
  {
    tradeId: 4203,
    tradeName: "T.Challa",
    currencyPair: "GBPUSD",
    notional: 750_000,
    dealtCurrency: "GBP",
    direction: Direction.Buy,
    spotRate: 1.27103,
    status: TradeStatus.Pending,
    tradeDate: isoDateAt(-1),
    valueDate: isoDateAt(-1 + SPOT_VALUE_DATE_OFFSET_DAYS),
  },
  {
    tradeId: 4204,
    tradeName: "S.Rogers",
    currencyPair: "EURJPY",
    notional: 1_500_000,
    dealtCurrency: "EUR",
    direction: Direction.Sell,
    spotRate: 164.87,
    status: TradeStatus.Rejected,
    tradeDate: isoDateAt(-2),
    valueDate: isoDateAt(-2 + SPOT_VALUE_DATE_OFFSET_DAYS),
  },
  {
    tradeId: 4205,
    tradeName: "B.Banner",
    currencyPair: "AUDUSD",
    notional: 3_000_000,
    dealtCurrency: "AUD",
    direction: Direction.Sell,
    spotRate: 0.6621,
    status: TradeStatus.Pending,
    tradeDate: isoDateAt(-6),
    valueDate: isoDateAt(-6 + SPOT_VALUE_DATE_OFFSET_DAYS),
  },
  LIVE_TRADE,
];

/** Always empty: the newest-row flash is animation, and the scenario seeds
 * power-saver `freeze` to hold the frame at rest — a non-empty set would pin
 * a highlight that depends on timing the fake must not model. */
const EMPTY_NEW_TRADE_IDS: ReadonlySet<number> = new Set();

/**
 * One live-executed entry, for `LIVE_TRADE` — matching
 * `BlotterPresenter.activity$`'s real rule that only "You" trades ever reach
 * the Activity feed (see its doc comment). `time` is derived from
 * `PINNED_NOW_MS` via `timeOfDayAt`, never a clock read.
 */
const ACTIVITY: readonly ActivityEntry[] = [
  { trade: LIVE_TRADE, time: timeOfDayAt(-3 * MINUTE_MS - 12_000) },
];

export const blotterSlice: BlotterSlice = {
  useTrades: () => {
    return TRADES;
  },
  useNewTradeIds: () => {
    return EMPTY_NEW_TRADE_IDS;
  },
  useActivity: () => {
    return ACTIVITY;
  },
};
