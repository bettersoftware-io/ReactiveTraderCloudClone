import type { CandleSeriesPresenter, StateStream, Stream } from "@rtc/core-api";
import { stitchCandles } from "@rtc/core-logic";
import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

import { once, relay } from "#/bridge/in";
import { storeToStateStream, topicToStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore, type Store } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";

const DEFAULT_TIMEFRAME: CandleTimeframe = "1D";

/** Per-(symbol|timeframe) backfill state. Everything but the two flags is
 * plain mutable state the key's producer and `loadOlder` share. The two
 * `*Stream` fields are the `StateStream`s wrapping `loading`/`exhausted`,
 * built once alongside the Stores they wrap — presenter-owned cells, not
 * port reads (slice 4 ruling), so `loadingOlder$`/`historyExhausted$` must
 * hand back the SAME reference on a repeat call for the same key, the way
 * the RxJS presenter's `BehaviorSubject` per key does. */
interface Backfill {
  readonly loading: Store<boolean>;
  readonly exhausted: Store<boolean>;
  readonly loadingStream: StateStream<boolean>;
  readonly exhaustedStream: StateStream<boolean>;
  older: readonly Candle[];
  /** The live base series of the CURRENT warm period; null between periods
   * — cleared by the producer's own abort listener when a period ends, not
   * only reset at the next period's start. */
  base: readonly Candle[] | null;
  /** First candle of the latest stitched emission — the next page's anchor. */
  latestFirst: Candle | null;
  inFlight: boolean;
  lastErrorAtMs: number | null;
  /** The current period's publish; a superseded period's is inert. */
  publish: ((series: readonly Candle[]) => void) | null;
}

/** The RxJS presenter's semantics on Topics and Stores (slice 4 ruling 11):
 * a refCounted, replay-1 series per key that stitches the prepended pages
 * ahead of the live base (`stitchCandles`, imported); a fresh warm period
 * RESETS the key's backfill, because the base regenerates from a new "now";
 * `loadOlder` is single-flight, anchored at the series' first candle,
 * latches exhaustion on a short page and backs off for
 * `CANDLE_HISTORY_RETRY_COOLDOWN_MS` after a failure. An in-flight page is
 * not cancelled by its period ending — only by `lifetime`. */
export function createCandleSeriesPresenter(
  marketData: MarketDataPort,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): CandleSeriesPresenter {
  const series = new Map<string, Stream<readonly Candle[]>>();
  const backfills = new Map<string, Backfill>();

  function backfillFor(key: string): Backfill {
    const existing = backfills.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const loading = createStore(false);
    const exhausted = createStore(false);
    const created: Backfill = {
      loading,
      exhausted,
      loadingStream: storeToStateStream(loading),
      exhaustedStream: storeToStateStream(exhausted),
      older: [],
      base: null,
      latestFirst: null,
      inFlight: false,
      lastErrorAtMs: null,
      publish: null,
    };
    backfills.set(key, created);
    return created;
  }

  function publishStitched(state: Backfill): void {
    if (state.base === null || state.publish === null) {
      return;
    }

    const stitched = stitchCandles(state.older, state.base);
    state.latestFirst = stitched[0] ?? null;
    state.publish(stitched);
  }

  function openSeries(
    symbol: string,
    timeframe: CandleTimeframe,
    state: Backfill,
  ): Stream<readonly Candle[]> {
    // An empty symbol is the workspace's transient "nothing selected yet":
    // an empty series, never a port call.
    if (symbol === "") {
      return storeToStateStream(createStore<readonly Candle[]>([]));
    }

    const base$ = marketData.candles(symbol, timeframe);

    return topicToStream(
      createTopic<readonly Candle[]>(
        (signal, publish) => {
          state.older = [];
          state.exhausted.set(false);
          state.latestFirst = null;
          state.base = null;
          state.publish = publish;
          // A page can still land BETWEEN periods (`fetchOlderPage` is
          // bound to `lifetime`, not this signal) — clear the pair the
          // moment THIS period ends, not only at the next period's start,
          // so a between-periods `publishStitched` early-returns instead
          // of stitching against a stale base and moving `latestFirst`.
          signal.addEventListener(
            "abort",
            () => {
              state.base = null;
              state.publish = null;
            },
            { once: true },
          );
          return relay(base$, signal, (base) => {
            state.base = base;
            publishStitched(state);
          });
        },
        { replay: true },
      ),
    );
  }

  async function fetchOlderPage(
    symbol: string,
    timeframe: CandleTimeframe,
    anchor: Candle,
    state: Backfill,
  ): Promise<void> {
    try {
      const page = await once(
        marketData.candleHistory(
          symbol,
          timeframe,
          anchor.time,
          CANDLE_HISTORY_PAGE,
        ),
        lifetime,
      );
      state.lastErrorAtMs = null;

      if (page.length < CANDLE_HISTORY_PAGE) {
        state.exhausted.set(true);
      }

      if (page.length > 0) {
        state.older = [...page, ...state.older];
        publishStitched(state);
      }
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      state.lastErrorAtMs = now();
    } finally {
      state.inFlight = false;
      state.loading.set(false);
    }
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

      state.inFlight = true;
      state.loading.set(true);
      void spawn(() => {
        return fetchOlderPage(symbol, timeframe, anchor, state);
      }, reportAsync);
    },
    loadingOlder$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return backfillFor(`${symbol}|${timeframe}`).loadingStream;
    },
    historyExhausted$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return backfillFor(`${symbol}|${timeframe}`).exhaustedStream;
    },
  };
}
