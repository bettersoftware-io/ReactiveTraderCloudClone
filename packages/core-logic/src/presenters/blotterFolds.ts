import type { ActivityEntry } from "@rtc/core-api";
import {
  ACTIVITY_FEED_CAP,
  DEFAULT_TRADER_NAME,
  type Trade,
} from "@rtc/domain";

/** The `newTradeIds$` fold state. `seen` is MUTATED across steps (one Set
 * for the fold's life, as the RxJS `scan` seed was); `fresh` is rebuilt per
 * snapshot. Shared by the three application cores: the fold under test is
 * the same function driven by a different runtime. */
export interface NewTradeScan {
  readonly seen: Set<number>;
  readonly fresh: ReadonlySet<number>;
  readonly initialized: boolean;
}

/** The `activity$` fold state — same `seen` discipline as `NewTradeScan`. */
export interface ActivityScan {
  readonly seen: Set<number>;
  readonly entries: readonly ActivityEntry[];
  readonly initialized: boolean;
}

export function createNewTradeScan(): NewTradeScan {
  return {
    seen: new Set<number>(),
    fresh: new Set<number>(),
    initialized: false,
  };
}

/** Ids that appeared in this snapshot and were never seen before — empty for
 * the first snapshot, so an initial load does not flash every row as new. */
export function reduceNewTrades(
  acc: NewTradeScan,
  trades: readonly Trade[],
): NewTradeScan {
  const fresh = new Set<number>();

  for (const trade of trades) {
    if (!acc.seen.has(trade.tradeId)) {
      if (acc.initialized) {
        fresh.add(trade.tradeId);
      }

      acc.seen.add(trade.tradeId);
    }
  }

  return { seen: acc.seen, fresh, initialized: true };
}

export function createActivityScan(): ActivityScan {
  return { seen: new Set<number>(), entries: [], initialized: false };
}

/** Live executions (`tradeName === DEFAULT_TRADER_NAME`) that appeared after
 * the first snapshot, newest first, capped at `ACTIVITY_FEED_CAP`. `now` is
 * the wall clock in ms — injected so the fold is pure and a test can pin it.
 * With no additions the SAME `entries` array is returned. */
export function reduceActivity(
  acc: ActivityScan,
  trades: readonly Trade[],
  now: number,
): ActivityScan {
  const additions: ActivityEntry[] = [];

  for (const trade of trades) {
    if (acc.seen.has(trade.tradeId)) {
      continue;
    }

    acc.seen.add(trade.tradeId);

    if (acc.initialized && trade.tradeName === DEFAULT_TRADER_NAME) {
      additions.push({ trade, time: formatClockTime(now) });
    }
  }

  const entries =
    additions.length > 0
      ? [...additions, ...acc.entries].slice(0, ACTIVITY_FEED_CAP)
      : acc.entries;

  return { seen: acc.seen, entries, initialized: true };
}

/** Wall-clock HH:MM:SS, local time. */
export function formatClockTime(ms: number): string {
  const d = new Date(ms);

  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
