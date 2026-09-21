import { describe, expect, it } from "vitest";

import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createCandle, createCandles } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const T0 = 1_700_000_000_000;
const STEP_MS = 60_000;
const BASE = createCandles(3, T0, STEP_MS);

function times(series: readonly Candle[] | undefined): number[] {
  return (series ?? []).map((candle) => {
    return candle.time;
  });
}

export function describeCandleSeriesContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("candles$ is memoised per (symbol, timeframe), and an omitted timeframe is 1D", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        expect(p.candles$("AAPL")).toBe(p.candles$("AAPL", "1D"));
        expect(p.candles$("AAPL")).not.toBe(p.candles$("AAPL", "1W"));
        expect(p.candles$("AAPL")).not.toBe(p.candles$("MSFT"));
      } finally {
        await h.teardown();
      }
    });

    it("an empty symbol is an empty series, synchronously, and loadOlder on it is a no-op", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$(""));
        expect(c.values).toEqual([[]]);
        p.loadOlder("");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        expect(h.driver.candlesObserved("", "1D")).toBe(false);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("delivers the base series, follows live appends, and replays the latest to a late joiner synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        expect(c.values).toEqual([]);
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        expect(times(c.values.at(-1))).toEqual(times(BASE));
        const appended = [...BASE, createCandle(T0 + 3 * STEP_MS)];
        h.driver.emitCandles("AAPL", "1D", appended);
        await settle();
        expect(times(c.values.at(-1))).toEqual(times(appended));
        const late = collect(p.candles$("AAPL"));
        expect(late.values.map(times)).toEqual([times(appended)]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    // The empty-symbol series above and these two flags are replay-current
    // CELLS the presenter itself owns, not port reads — a replay-current
    // stream's first value is synchronous in every core (the slice 1a
    // envelope promise). Only a keyed WIRE stream's first value (`quote$`,
    // `depth$`, a fresh `candles$` period) is left uncontracted, because a
    // core may follow the port a scheduler hop later.
    it("the backfill flags start false, synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const loading = collect(p.loadingOlder$("AAPL"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        expect(loading.values).toEqual([false]);
        expect(exhausted.values).toEqual([false]);
        loading.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("loadOlder before the series has emitted is a no-op", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        await settle();
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("loadOlder asks for one page before the series' first candle, single-flight; a FULL page is prepended and the next load anchors at the new first candle; a SHORT page latches exhaustion", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        const loading = collect(p.loadingOlder$("AAPL"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([
          {
            symbol: "AAPL",
            timeframe: "1D",
            beforeTime: T0,
            count: CANDLE_HISTORY_PAGE,
          },
        ]);
        expect(loading.values.at(-1)).toBe(true);
        const pageStart = T0 - CANDLE_HISTORY_PAGE * STEP_MS;
        h.driver.resolveCandleHistory(
          createCandles(CANDLE_HISTORY_PAGE, pageStart, STEP_MS),
        );
        await settle();
        const stitched = c.values.at(-1) ?? [];
        expect(stitched).toHaveLength(CANDLE_HISTORY_PAGE + BASE.length);
        expect(stitched[0]?.time).toBe(pageStart);
        expect(stitched.at(-1)?.time).toBe(BASE.at(-1)?.time);
        expect(loading.values.at(-1)).toBe(false);
        expect(exhausted.values.at(-1)).toBe(false);
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()[0]?.beforeTime).toBe(pageStart);
        h.driver.resolveCandleHistory(
          createCandles(2, pageStart - 2 * STEP_MS, STEP_MS),
        );
        await settle();
        expect(c.values.at(-1)).toHaveLength(CANDLE_HISTORY_PAGE + 5);
        expect(exhausted.values.at(-1)).toBe(true);
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        c.unsubscribe();
        loading.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("an EMPTY page latches exhaustion and leaves the series alone; a page overlapping the base never duplicates a candle, and a page candle newer than the base's first contributes nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const aapl = collect(p.candles$("AAPL"));
        const msft = collect(p.candles$("MSFT"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        h.driver.emitCandles("MSFT", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        await settle();
        h.driver.resolveCandleHistory([]);
        await settle();
        expect(exhausted.values.at(-1)).toBe(true);
        expect(times(aapl.values.at(-1))).toEqual(times(BASE));
        p.loadOlder("MSFT");
        await settle();
        h.driver.resolveCandleHistory([
          createCandle(T0 - STEP_MS),
          createCandle(T0, 999),
          // The contiguity witness: strictly newer than BASE[0] (T0) and not
          // itself a base candle, so dedupe-by-time alone cannot explain its
          // absence below — only the contiguity guard drops it.
          createCandle(T0 + STEP_MS / 2),
        ]);
        await settle();
        expect(times(msft.values.at(-1))).toEqual([
          T0 - STEP_MS,
          ...times(BASE),
        ]);
        expect(msft.values.at(-1)?.[1]?.close).toBe(BASE[0]?.close);
        aapl.unsubscribe();
        msft.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failed page clears loading without latching exhaustion, blocks a retry for CANDLE_HISTORY_RETRY_COOLDOWN_MS, and allows one at the boundary", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const p = h.app.presenters.candleSeries;
          const c = collect(p.candles$("AAPL"));
          const loading = collect(p.loadingOlder$("AAPL"));
          const exhausted = collect(p.historyExhausted$("AAPL"));
          await clock.settle();
          h.driver.emitCandles("AAPL", "1D", BASE);
          await clock.settle();
          p.loadOlder("AAPL");
          await clock.settle();
          h.driver.failCandleHistory(new Error("bust"));
          await clock.settle();
          expect(loading.values.at(-1)).toBe(false);
          expect(exhausted.values.at(-1)).toBe(false);
          expect(c.errors).toEqual([]);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toEqual([]);
          await clock.advance(CANDLE_HISTORY_RETRY_COOLDOWN_MS - 1);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toEqual([]);
          await clock.advance(1);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toHaveLength(1);
          c.unsubscribe();
          loading.unsubscribe();
          exhausted.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("releases the port on the last unsubscribe, and a fresh warm period starts over: no replay, exhaustion cleared, the backfilled pages gone", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const first = collect(p.candles$("AAPL"));
        const exhaustedFirst = collect(p.historyExhausted$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        await settle();
        // A one-candle page is SHORT, so exhaustion latches — the precondition
        // this case's "cleared" claim is measured against, local to this
        // period rather than assumed from an earlier case.
        h.driver.resolveCandleHistory([createCandle(T0 - STEP_MS)]);
        await settle();
        expect(first.values.at(-1)).toHaveLength(BASE.length + 1);
        expect(exhaustedFirst.values.at(-1)).toBe(true);
        first.unsubscribe();
        exhaustedFirst.unsubscribe();
        await settle();
        expect(h.driver.candlesObserved("AAPL", "1D")).toBe(false);
        const again = collect(p.candles$("AAPL"));
        expect(again.values).toEqual([]);
        const exhausted = collect(p.historyExhausted$("AAPL"));
        expect(exhausted.values.at(-1)).toBe(false);
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        expect(times(again.values.at(-1))).toEqual(times(BASE));
        again.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
