import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { MarketDataPort } from "@rtc/domain";
import { CANDLE_HISTORY_RETRY_COOLDOWN_MS, type Candle } from "@rtc/domain";

import { createCandleSeriesPresenter } from "#/presenters/candleSeries";

describe("createCandleSeriesPresenter", () => {
  it('candles$("") never calls marketData.candles and yields an empty series synchronously', () => {
    let calls = 0;
    const marketData = createMarketDataStub({
      candles: () => {
        calls += 1;
        return new Subject<readonly Candle[]>();
      },
    });

    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
    );
    const seen: (readonly Candle[])[] = [];
    presenter.candles$("").subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([[]]);
    expect(calls).toBe(0);
  });

  it("loadingOlder$/historyExhausted$ are memoised per (symbol, timeframe) — a repeat call is the SAME reference", () => {
    const presenter = createCandleSeriesPresenter(
      createMarketDataStub(),
      new AbortController().signal,
    );

    expect(presenter.loadingOlder$("AAPL")).toBe(
      presenter.loadingOlder$("AAPL", "1D"),
    );
    expect(presenter.loadingOlder$("AAPL")).not.toBe(
      presenter.loadingOlder$("AAPL", "1W"),
    );
    expect(presenter.historyExhausted$("AAPL")).toBe(
      presenter.historyExhausted$("AAPL", "1D"),
    );
    expect(presenter.historyExhausted$("AAPL")).not.toBe(
      presenter.historyExhausted$("MSFT"),
    );
  });

  it("now is injectable and the cooldown honours it without fake timers", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const base$ = new Subject<readonly Candle[]>();
    const marketData = createMarketDataStub({
      candles: () => {
        return base$;
      },
      candleHistory: () => {
        const source = new Subject<readonly Candle[]>();
        history.push(source);
        return source;
      },
    });
    let clock = 0;
    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
      () => {
        return clock;
      },
    );

    presenter.candles$("AAPL").subscribe(() => {});
    base$.next([createCandle(1_000)]);
    await settle();

    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);
    history[0]?.error(new Error("bust"));
    await settle();

    // Within the cooldown: no retry.
    clock = CANDLE_HISTORY_RETRY_COOLDOWN_MS - 1;
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);

    // At the boundary: a retry is allowed.
    clock = CANDLE_HISTORY_RETRY_COOLDOWN_MS;
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(2);
  });

  // The reachable half of `publishStitched`'s guard: a page requested in
  // period 1 can land AFTER period 2 has already reset `state.base` to null
  // (its own base hasn't arrived yet) — `state.base === null` is not
  // defensive dead code, it is exactly this window. Ordering, precisely:
  // period 1 gets a base and starts a loadOlder (anchored on it) → period 1
  // ends → period 2 starts, resetting `older`/`base`/`latestFirst` → THEN
  // the stale page resolves (nothing publishes: base is still null) → THEN
  // period 2's own base arrives (now it publishes).
  //
  // What lands in period 2's series once it does publish: this MATCHES the
  // RxJS `CandleSeriesPresenter`, checked directly against its source
  // (`packages/client-core/src/presenters/CandleSeriesPresenter.ts`) — its
  // `older$` is one BehaviorSubject that survives across periods; a fresh
  // cycle's `defer` only `.next([])`s its VALUE, and the stale page's own
  // `next` handler still runs `older$.next([...page, ...older$.value])`
  // whenever it lands, landing in whatever period is live at THAT moment.
  // So a page that resolves after the reset but before the new base ends up
  // prepended into the NEW period too — not dropped. This port's `state`
  // object is the same shape (one mutable cell per key, `older` reset
  // in-place at the start of each producer run), so it reproduces the same
  // outcome: the stale page survives into period 2's first published series.
  it("a page requested in one period, landing after the NEXT period has already reset base, publishes nothing until the new base arrives — then carries the stale page forward, matching the RxJS presenter", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const base$ = new Subject<readonly Candle[]>();
    const marketData = createMarketDataStub({
      candles: () => {
        return base$;
      },
      candleHistory: () => {
        const source = new Subject<readonly Candle[]>();
        history.push(source);
        return source;
      },
    });

    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
    );

    // Period 1: a base arrives, loadOlder anchors on it and goes in flight.
    const first = presenter.candles$("AAPL").subscribe(() => {});
    base$.next([BASE_T0]);
    await settle();
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);

    // Period 1 ends; period 2 starts (same cached stream, fresh producer
    // run) — this synchronously resets `state.base` to null.
    first.unsubscribe();
    await settle();
    const values: (readonly Candle[])[] = [];
    presenter.candles$("AAPL").subscribe((v) => {
      values.push(v);
    });
    expect(values).toEqual([]);

    // The stale page resolves NOW — after the reset, before period 2's own
    // base. `publishStitched` reads `state.base === null` and returns early:
    // nothing is published.
    history[0]?.next([STALE_CANDLE]);
    await settle();
    expect(values).toEqual([]);

    // Period 2's own base finally arrives: `publishStitched` now has both a
    // base and a live `state.publish`, and stitches the stale page (still
    // sitting in `state.older` from the early-returned call above) ahead of
    // it.
    base$.next([BASE_T0, BASE_T0_PLUS_STEP]);
    await settle();
    expect(values).toEqual([[STALE_CANDLE, BASE_T0, BASE_T0_PLUS_STEP]]);
  });

  it("lifetime.abort() abandons an in-flight page silently", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const base$ = new Subject<readonly Candle[]>();
    const marketData = createMarketDataStub({
      candles: () => {
        return base$;
      },
      candleHistory: () => {
        const source = new Subject<readonly Candle[]>();
        history.push(source);
        return source;
      },
    });

    const lifetime = new AbortController();
    const presenter = createCandleSeriesPresenter(marketData, lifetime.signal);
    presenter.candles$("AAPL").subscribe(() => {});
    base$.next([createCandle(1_000)]);
    await settle();
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);
    expect(history[0]?.observed).toBe(true);

    expect(() => {
      lifetime.abort();
    }).not.toThrow();
    await settle();
    expect(history[0]?.observed).toBe(false);
  });
});

const T0 = 1_000;
const STEP_MS = 100;
const BASE_T0: Candle = createCandle(T0);
const BASE_T0_PLUS_STEP: Candle = createCandle(T0 + STEP_MS);
// Strictly before BASE_T0 — the contiguity guard `stitchCandles` applies
// (`packages/client-core/src/presenters/candleStitch.ts`) keeps it.
const STALE_CANDLE: Candle = createCandle(T0 - STEP_MS);

function createCandle(time: number, close = 100): Candle {
  return {
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  };
}

function createMarketDataStub(
  overrides: Partial<MarketDataPort> = {},
): MarketDataPort {
  return {
    watchlist: () => {
      return new Subject();
    },
    quotes: () => {
      return new Subject();
    },
    candles: () => {
      return new Subject<readonly Candle[]>();
    },
    candleHistory: () => {
      return new Subject<readonly Candle[]>();
    },
    depth: () => {
      return new Subject();
    },
    ...overrides,
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
