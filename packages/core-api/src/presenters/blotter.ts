import type { Trade } from "@rtc/domain";

import type { Stream } from "#/stream";

/** One live-executed trade, timestamped for the Activity feed. */
export interface ActivityEntry {
  /** Same trade the blotter table renders — the feed reuses that source,
   * it doesn't fetch anything new. */
  readonly trade: Trade;
  /** Wall-clock HH:MM:SS captured the instant this trade was first observed
   * by the presenter. `Trade` itself carries only a date (tradeDate), not a
   * time-of-day, so this is stamped in the app layer rather than adding a
   * domain field or reading the clock from the dumb UI. */
  readonly time: string;
}

export interface BlotterPresenter {
  readonly trades$: Stream<readonly Trade[]>;
  /** Ids of trades that appeared after the initial snapshot, recomputed per
   * emission. This stream-diff lives in the presenter — not the UI — so the
   * dumb UI does no cross-render bookkeeping (see architecture.md §1.2 and
   * docs/adr/ADR-003). The first snapshot is suppressed so an initial load
   * does not flash every row as "new". */
  readonly newTradeIds$: Stream<ReadonlySet<number>>;
  /** Live-executed trades, newest first, for the Activity feed (FX Blotter's
   * "Activity" tab). It accumulates only from EXECUTIONS during this session —
   * the seeded historical blotter rows never appear, so the feed starts empty.
   * A trade counts as "live" when `tradeName === DEFAULT_TRADER_NAME` ("You").
   * Like `newTradeIds$`, the first snapshot is suppressed (seed load isn't
   * "activity"). Capped at `ACTIVITY_CAP` entries (oldest dropped first), and
   * the accumulator survives a consumer unmounting. */
  readonly activity$: Stream<readonly ActivityEntry[]>;
}
