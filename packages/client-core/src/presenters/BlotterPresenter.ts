import { map, type Observable, scan, shareReplay } from "rxjs";

import type {
  ActivityEntry,
  BlotterPresenter as BlotterPresenterApi,
} from "@rtc/core-api";
import {
  type ActivityScan,
  createActivityScan,
  createNewTradeScan,
  reduceActivity,
  reduceNewTrades,
} from "@rtc/core-logic";
import {
  ACTIVITY_FEED_CAP,
  type BlotterPort,
  type Trade,
  TradeBlotterUseCase,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 4) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { ActivityEntry };

/** Maximum number of Activity feed rows retained (newest-first), mirroring
 * client-prototype's own `ACTIVITY_CAP` (packages/client-prototype/src/fx/useFxRates.ts)
 * for behavioural parity with the v2 design. Now the domain's
 * `ACTIVITY_FEED_CAP`; kept under this name for the two web clients' imports. */
export const ACTIVITY_CAP: number = ACTIVITY_FEED_CAP;

export class BlotterPresenter implements BlotterPresenterApi {
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
    // Singleton (one blotter per connection) → warm across tab remounts, so
    // the blotter table keeps its rows and doesn't re-subscribe. activity$
    // below already relies on trades$ staying alive (see its comment).
    this.trades$ = new TradeBlotterUseCase(blotter)
      .execute()
      .pipe(warmReplay());

    this.newTradeIds$ = this.trades$.pipe(
      scan(reduceNewTrades, createNewTradeScan()),
      map((acc): ReadonlySet<number> => {
        return acc.fresh;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.activity$ = this.trades$.pipe(
      scan((acc: ActivityScan, trades: readonly Trade[]): ActivityScan => {
        return reduceActivity(acc, trades, Date.now());
      }, createActivityScan()),
      map((acc: ActivityScan): readonly ActivityEntry[] => {
        return acc.entries;
      }),
      // refCount: false — see the activity$ doc comment above.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
