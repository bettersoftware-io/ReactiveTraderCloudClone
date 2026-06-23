import { map, type Observable, scan, shareReplay } from "rxjs";

import { type BlotterPort, type Trade, TradeBlotterUseCase } from "@rtc/domain";

interface NewTradeScan {
  readonly seen: Set<number>;
  readonly fresh: ReadonlySet<number>;
  readonly initialized: boolean;
}

export class BlotterPresenter {
  readonly trades$: Observable<readonly Trade[]>;

  /** Ids of trades that appeared after the initial snapshot, recomputed per
   * emission. This stream-diff lives in the presenter — not the UI — so the
   * dumb UI does no cross-render bookkeeping (see architecture.md §1.2 and
   * docs/adr/ADR-003). The first snapshot is suppressed so an initial load
   * does not flash every row as "new". */
  readonly newTradeIds$: Observable<ReadonlySet<number>>;

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
  }
}
