import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { CandleTimeframe, MarketDataPort } from "@rtc/domain";
import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
} from "@rtc/domain";

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

  // The JSDoc on `Backfill.base` says "null between periods" — this pins
  // that literally, by observing its effect on the anchor rather than
  // reaching into presenter-private state. Without the fix, `state.base`
  // and `state.publish` stay whatever period 1 left them until the NEXT
  // producer run resets them (at ITS start), so a page resolving in the
  // gap — after period 1 ended, before anyone has resubscribed — runs
  // `publishStitched` against the STALE base/publish pair: the call is
  // inert to any subscriber (period 1's `publish` closure no longer
  // matches the topic's live run, since `run !== current`), but it still
  // moves `state.latestFirst` — the next `loadOlder`'s anchor — to the
  // stale page's own candle. A resubscribe afterwards would mask this (the
  // next producer run resets `latestFirst` synchronously at ITS OWN start
  // regardless of this fix), so the witness has to read the anchor WHILE
  // still in the gap: a second `loadOlder()` call, with nobody subscribed,
  // anchors on whatever `state.latestFirst` currently holds. RxJS and
  // Effect leave the anchor alone in this window (checked directly against
  // `packages/client-core/src/presenters/CandleSeriesPresenter.ts` — its
  // `error`/`complete` handlers never touch `older$`/`latestFirst` off a
  // stale subscription — and
  // `packages/client-core-effect/src/presenters/candleSeries.ts`, whose
  // fold is the SINGLE writer and only runs within a live period).
  it("a period's end clears its base and publish handle, so a page landing BETWEEN periods does not move the next loadOlder's anchor", async () => {
    const beforeTimes: number[] = [];
    const history: Subject<readonly Candle[]>[] = [];
    const base$ = new Subject<readonly Candle[]>();
    const marketData = createMarketDataStub({
      candles: () => {
        return base$;
      },
      candleHistory: (
        _symbol: string,
        _timeframe: CandleTimeframe,
        beforeTime: number,
      ) => {
        beforeTimes.push(beforeTime);
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
    expect(beforeTimes).toEqual([BASE_T0.time]);

    // Period 1 ends — last subscriber leaves, nobody has resubscribed yet.
    first.unsubscribe();
    await settle();

    // The in-flight page resolves BETWEEN periods: `fetchOlderPage` awaits
    // on `lifetime`, not the period's own signal, so period 1 ending does
    // not cancel it. A FULL page (not a short one) keeps
    // `historyExhausted$` false, so a second `loadOlder()` isn't skipped
    // by the exhaustion guard.
    history[0]?.next(STALE_PAGE);
    await settle();

    // Still nobody subscribed to `candles$` — still in the gap. A second
    // loadOlder() anchors on whatever `state.latestFirst` holds right now:
    // the BASE's own first candle if the fix cleared `state.base`/
    // `state.publish` on period 1's end, or the stale page's oldest candle
    // if it did not (the bug this case pins).
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(2);
    expect(beforeTimes[1]).toBe(BASE_T0.time);
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
// (`packages/core-logic/src/presenters/candleStitch.ts`) keeps it.
const STALE_CANDLE: Candle = createCandle(T0 - STEP_MS);
// A FULL page (length === CANDLE_HISTORY_PAGE), all strictly before
// BASE_T0, oldest first — long enough that `page.length < CANDLE_HISTORY_PAGE`
// stays false, so it never latches `historyExhausted$`.
const STALE_PAGE: readonly Candle[] = Array.from(
  { length: CANDLE_HISTORY_PAGE },
  (_, index) => {
    return createCandle(T0 - STEP_MS * (CANDLE_HISTORY_PAGE - index));
  },
);

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
