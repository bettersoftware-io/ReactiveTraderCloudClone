import { Effect, Option, Stream } from "effect";

import type {
  CandleSeriesPresenter,
  Stream as CoreStream,
} from "@rtc/core-api";
import { stitchCandles } from "@rtc/core-logic";
import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

import {
  createHotStream,
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  type HotStream,
  portEvents,
  sharedFold,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef, type SyncRef } from "#/bridge/syncRef";

const DEFAULT_TIMEFRAME: CandleTimeframe = "1D";

/** Per-(symbol|timeframe) backfill state. The two flags are presenter-owned
 * CELLS — replay-current across warm periods, which is why they are
 * `SyncRef`s rather than folds;
 * everything else is plain mutable state the key's period and `loadOlder`
 * share. */
interface Backfill {
  readonly loading: SyncRef<boolean>;
  readonly exhausted: SyncRef<boolean>;
  /** The two cells as streams, built ONCE with the refs: `loadingOlder$`
   * and `historyExhausted$` hand back the same instance per key, as the
   * RxJS core's `BehaviorSubject`s do. */
  readonly loading$: CoreStream<boolean>;
  readonly exhausted$: CoreStream<boolean>;
  older: readonly Candle[];
  /** First candle of the latest stitched emission — the next page's anchor. */
  latestFirst: Candle | null;
  inFlight: boolean;
  lastErrorAtMs: number | null;
  /** The CURRENT warm period's "older changed" signal; a page landing
   * between periods publishes to one nobody hears, which is inert. */
  nudges: HotStream<void> | null;
}

/** What the period's single writer folds: a fresh base series from the
 * port, or "the backfill grew" from `loadOlder`. */
type SeriesEvent =
  | { readonly kind: "base"; readonly base: readonly Candle[] }
  | { readonly kind: "older" };

/** The RxJS presenter's semantics on folds and refs (slice 4 ruling 11): a
 * refCounted, replay-current series per key that stitches the prepended
 * pages ahead of the live base (`stitchCandles`, imported — never
 * re-derived); a fresh warm period RESETS the key's backfill, because the
 * base regenerates from a new "now"; `loadOlder` is single-flight, anchored
 * at the series' first candle, latches exhaustion on a short page and backs
 * off for `CANDLE_HISTORY_RETRY_COOLDOWN_MS` after a failure (equal to the
 * cooldown allows, strictly inside blocks). An in-flight page is not
 * cancelled by its period ending — only by the host scope. The fold is the
 * SINGLE writer of the series: `loadOlder` never publishes, it grows
 * `older` and offers a nudge. */
export function createCandleSeriesPresenter(
  host: EffectHost,
  marketData: MarketDataPort,
  now: () => number = Date.now,
): CandleSeriesPresenter {
  const series = new Map<string, CoreStream<readonly Candle[]>>();
  const backfills = new Map<string, Backfill>();

  function backfillFor(key: string): Backfill {
    const existing = backfills.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const loading = createSyncRef(false);
    const exhausted = createSyncRef(false);
    const created: Backfill = {
      loading,
      exhausted,
      loading$: loading.stateStream(),
      exhausted$: exhausted.stateStream(),
      older: [],
      latestFirst: null,
      inFlight: false,
      lastErrorAtMs: null,
      nudges: null,
    };
    backfills.set(key, created);
    return created;
  }

  function recordPage(
    state: Backfill,
    page: readonly Candle[],
  ): Effect.Effect<void> {
    return Effect.suspend(() => {
      state.lastErrorAtMs = null;

      if (page.length > 0) {
        state.older = [...page, ...state.older];

        if (state.nudges !== null) {
          state.nudges.publish();
        }
      }

      return page.length < CANDLE_HISTORY_PAGE
        ? state.exhausted.write(() => {
            return true;
          })
        : Effect.void;
    });
  }

  function openSeries(
    symbol: string,
    timeframe: CandleTimeframe,
    state: Backfill,
  ): CoreStream<readonly Candle[]> {
    // An empty symbol is the workspace's transient "nothing selected yet":
    // an empty series, synchronously, and never a port call (the equities
    // market-data simulator throws for an unknown symbol).
    if (symbol === "") {
      return createSyncRef<readonly Candle[]>([]).stateStream();
    }

    const base$ = marketData.candles(symbol, timeframe);

    return sharedFold<readonly Candle[]>(host, {
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<readonly Candle[]>, fromPort: FromPort) => {
        // Plain synchronous code, as in `conflatedFold`: the period resets
        // the key's backfill and owns its port subscription from the moment
        // it starts, so a fresh subscriber sees a cleared `exhausted$` in
        // its own tick.
        const nudges = createHotStream<void>();
        state.older = [];
        state.latestFirst = null;
        state.nudges = nudges;
        state.exhausted.set(() => {
          return false;
        });
        const events = fromPort.merged<SeriesEvent>([
          portEvents(base$, (base): SeriesEvent => {
            return { kind: "base", base };
          }),
          portEvents(nudges.stream$, (): SeriesEvent => {
            return { kind: "older" };
          }),
        ]);
        let current: readonly Candle[] | null = null;

        return Stream.runForEach(events, (event) => {
          if (event.kind === "base") {
            current = event.base;
          }

          if (current === null) {
            return Effect.void;
          }

          const stitched = stitchCandles(state.older, current);
          state.latestFirst = stitched[0] ?? null;
          return update(() => {
            return stitched;
          });
        });
      },
    });
  }

  function fetchOlderPage(
    symbol: string,
    timeframe: CandleTimeframe,
    anchor: Candle,
    state: Backfill,
  ): void {
    state.inFlight = true;
    // `loading` is set true INSIDE the forked effect rather than
    // synchronously: every consumer reads it after a settle, and one writer
    // per cell keeps the ordering against `ensuring`'s clear obvious.
    host.runtime.runFork(
      state.loading
        .write(() => {
          return true;
        })
        .pipe(
          Effect.andThen(
            rpc(
              marketData.candleHistory(
                symbol,
                timeframe,
                anchor.time,
                CANDLE_HISTORY_PAGE,
              ),
            ),
          ),
          Effect.matchEffect({
            onFailure: () => {
              return Effect.sync(() => {
                state.lastErrorAtMs = now();
              });
            },
            onSuccess: (page: readonly Candle[]) => {
              return recordPage(state, page);
            },
          }),
          Effect.ensuring(
            Effect.suspend(() => {
              state.inFlight = false;
              return state.loading.write(() => {
                return false;
              });
            }),
          ),
        ),
      { scope: host.scope },
    );
  }

  return {
    candles$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      const key = `${symbol}|${timeframe}`;
      const cached = series.get(key);

      if (cached !== undefined) {
        return cached;
      }

      const stream = openSeries(symbol, timeframe, backfillFor(key));
      series.set(key, stream);
      return stream;
    },
    loadOlder: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      const state = backfillFor(`${symbol}|${timeframe}`);
      const anchor = state.latestFirst;

      if (state.inFlight || state.exhausted.get() || anchor === null) {
        return;
      }

      if (
        state.lastErrorAtMs !== null &&
        now() - state.lastErrorAtMs < CANDLE_HISTORY_RETRY_COOLDOWN_MS
      ) {
        return;
      }

      fetchOlderPage(symbol, timeframe, anchor, state);
    },
    loadingOlder$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return backfillFor(`${symbol}|${timeframe}`).loading$;
    },
    historyExhausted$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return backfillFor(`${symbol}|${timeframe}`).exhausted$;
    },
  };
}
