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

/** Maximum number of Activity feed rows retained (newest-first), mirroring
 * client-prototype's own `ACTIVITY_CAP` (packages/client-prototype/src/fx/useFxRates.ts)
 * for behavioural parity with the v2 design. */
export const ACTIVITY_CAP = 40;

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
   * "activity"), and this stream-diff lives here, not in the dumb UI.
   *
   * Capped at `ACTIVITY_CAP` entries (oldest dropped first).
   *
   * Uses `refCount: false` (unlike every other shareReplay in this
   * codebase) so the `scan` accumulator is NOT torn down when the last
   * subscriber (FxBlotter's ActivityView) unmounts. `App.tsx` remounts the
   * active tab's whole subtree on tab switch (`<WorkspaceEngine
   * key={activeTab}>`), which unsubscribes ActivityView; with the usual
   * `refCount: true`, that drops activity$'s subscriber count to zero, the
   * scan tears down, and on the next mount the accumulated entries are
   * gone — plus the resubscription to `trades$` sees TradeStoreSimulator's
   * replayed current snapshot and (correctly, per the "suppress first
   * snapshot" rule above) treats it as non-activity, so history is lost
   * silently rather than merely paused. `refCount: false` keeps the
   * internal subscription (and therefore the scan's accumulator) alive for
   * the lifetime of this presenter instead, which is safe here because
   * `BlotterPresenter` itself is a composition-root singleton
   * (packages/client-core/src/composition.ts) constructed once for the
   * app's lifetime — there is no per-mount instance to leak. The
   * trade-off: this presenter now holds one permanent subscription into
   * `trades$` (and transitively the blotter WS stream) even while no UI
   * is observing it, instead of releasing it between mounts; that is an
   * intentional, bounded, singleton-scoped cost, not an unbounded leak. */
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
              if (acc.initialized) {
                fresh.add(trade.tradeId);
              }

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
            if (acc.seen.has(trade.tradeId)) {
              continue;
            }

            acc.seen.add(trade.tradeId);

            if (acc.initialized && trade.tradeName === DEFAULT_TRADER_NAME) {
              additions.push({ trade, time: formatClockTime(Date.now()) });
            }
          }

          const entries =
            additions.length > 0
              ? [...additions, ...acc.entries].slice(0, ACTIVITY_CAP)
              : acc.entries;

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
      // refCount: false — see the activity$ doc comment above.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
