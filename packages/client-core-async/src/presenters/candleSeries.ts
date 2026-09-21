import { stitchCandles } from "@rtc/client-core";
import type { CandleSeriesPresenter, Stream } from "@rtc/core-api";
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
 * plain mutable state the key's producer and `loadOlder` share. */
interface Backfill {
  readonly loading: Store<boolean>;
  readonly exhausted: Store<boolean>;
  older: readonly Candle[];
  /** The live base series of the CURRENT warm period; null between periods. */
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

    const created: Backfill = {
      loading: createStore(false),
      exhausted: createStore(false),
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
      return storeToStateStream(backfillFor(`${symbol}|${timeframe}`).loading);
    },
    historyExhausted$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return storeToStateStream(
        backfillFor(`${symbol}|${timeframe}`).exhausted,
      );
    },
  };
}
