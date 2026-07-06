import { map, type Observable, scan, shareReplay } from "rxjs";

import {
  type BlotterPort,
  DEFAULT_TRADER_NAME,
  type Trade,
  TradeBlotterUseCase,
} from "@rtc/domain";

interface NewTradeScan {
  readonly seen: Set<number>;
  readonly fresh: ReadonlySet<number>;
  readonly initialized: boolean;
}

/** One live-executed trade, timestamped for the Activity feed. */
export interface ActivityEntry {
  /** Same trade the blotter table renders — the feed reuses that source,
   * it doesn't fetch anything new. */
  readonly trade: Trade;
  /** Wall-clock HH:MM:SS captured the instant this trade was first observed
   * by the presenter. `Trade` itself carries only a date (tradeDate), not a
   * time-of-day, so this is stamped here — the app layer, same idiom as
   * RfqCountdownMachine's `Date.now()` read at creation — rather than adding
   * a domain field or reading the clock from the dumb UI. */
  readonly time: string;
}

interface ActivityScan {
  readonly seen: Set<number>;
  readonly entries: readonly ActivityEntry[];
  readonly initialized: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatClockTime(ms: number): string {
  const d = new Date(ms);

  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export class BlotterPresenter {
  readonly trades$: Observable<readonly Trade[]>;

  /** Ids of trades that appeared after the initial snapshot, recomputed per
   * emission. This stream-diff lives in the presenter — not the UI — so the
   * dumb UI does no cross-render bookkeeping (see architecture.md §1.2 and
   * docs/adr/ADR-003). The first snapshot is suppressed so an initial load
   * does not flash every row as "new". */
  readonly newTradeIds$: Observable<ReadonlySet<number>>;

  /** Live-executed trades, newest first, for the Activity feed (FX Blotter's
   * "Activity" tab). Mirrors the PROTO's activity feed behaviour exactly: it
   * accumulates only from EXECUTIONS during this session — the seeded
   * historical blotter rows never appear, so the feed starts empty. A trade
   * counts as "live" when `tradeName === DEFAULT_TRADER_NAME` ("You") — the
   * domain's own distinction (ExecutionSimulator always attributes local
   * executions to that name; TradeStoreSimulator's seeds keep their own
   * historical trader names) — not a magic id-threshold. Like
   * `newTradeIds$`, the first snapshot is suppressed (seed load isn't
   * "activity"), and this stream-diff lives here, not in the dumb UI. */
  readonly activity$: Observable<readonly ActivityEntry[]>;

  constructor(blotter: BlotterPort) {
    this.trades$ = new TradeBlotterUseCase(blotter)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    this.newTradeIds$ = this.trades$.pipe(
      scan(
        (acc: NewTradeScan, trades: readonly Trade[]): NewTradeScan => {
          const fresh = new Set<number>();

          for (const trade of trades) {
            if (!acc.seen.has(trade.tradeId)) {
              // The entire first snapshot is the initial load — nothing is
              // "new" yet. Only arrivals on later emissions are flagged.
              if (acc.initialized) fresh.add(trade.tradeId);
              acc.seen.add(trade.tradeId);
            }
          }

          return { seen: acc.seen, fresh, initialized: true };
        },
        {
          seen: new Set<number>(),
          fresh: new Set<number>() as ReadonlySet<number>,
          initialized: false,
        },
      ),
      map((acc: NewTradeScan): ReadonlySet<number> => {
        return acc.fresh;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.activity$ = this.trades$.pipe(
      scan(
        (acc: ActivityScan, trades: readonly Trade[]): ActivityScan => {
          // Collect this emission's arrivals in trades' own order (newest
          // first — TradeBlotterUseCase/BlotterPort preserve that ordering)
          // so a batch of simultaneous arrivals stays correctly ordered when
          // prepended as one block below.
          const additions: ActivityEntry[] = [];

          for (const trade of trades) {
            if (acc.seen.has(trade.tradeId)) continue;
            acc.seen.add(trade.tradeId);

            if (acc.initialized && trade.tradeName === DEFAULT_TRADER_NAME) {
              additions.push({ trade, time: formatClockTime(Date.now()) });
            }
          }

          const entries =
            additions.length > 0 ? [...additions, ...acc.entries] : acc.entries;

          return { seen: acc.seen, entries, initialized: true };
        },
        {
          seen: new Set<number>(),
          entries: [] as readonly ActivityEntry[],
          initialized: false,
        },
      ),
      map((acc: ActivityScan): readonly ActivityEntry[] => {
        return acc.entries;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
