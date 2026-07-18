import {
  BehaviorSubject,
  lastValueFrom,
  of,
  Subject,
  take,
  toArray,
} from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type PriceTick,
  type PricingPort,
  PricingSimulator,
} from "@rtc/domain";

import { PriceHistoryPresenter } from "../PriceHistoryPresenter";

describe("PriceHistoryPresenter", () => {
  it("accumulates live ticks into a rolling buffer", async () => {
    const t1 = tick(1.1, 1);
    const t2 = tick(1.1001, 2);
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of(t1, t2);
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceHistoryPresenter(port, of(false));
    // The use case emits incrementally: [t1] then [t1, t2]. take(2) + toArray collects both.
    const emissions = await lastValueFrom(
      presenter.history$("EURUSD").pipe(take(2), toArray()),
    );
    expect(emissions).toEqual([[t1], [t1, t2]]);
  });

  it("caches by symbol", () => {
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of();
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceHistoryPresenter(port, of(false));
    expect(presenter.history$("EURUSD")).toBe(presenter.history$("EURUSD"));
    expect(presenter.history$("EURUSD")).not.toBe(presenter.history$("GBPUSD"));
  });
});

describe("PriceHistoryPresenter power-saver conflation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("conflates history updates to at most one per 1000ms while power saver is on", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(true);
    const presenter = new PriceHistoryPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = presenter.history$("EURUSD").subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(4_000);
    // 1000ms buckets over 4s: at most 1 leading + floor(4000/1000) trailing emissions.
    expect(count).toBeLessThanOrEqual(1 + Math.floor(4_000 / 1_000));
    sub.unsubscribe();
  });

  it("passes history updates through untouched (unconflated) while power saver is off", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(false);
    const presenter = new PriceHistoryPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = presenter.history$("EURUSD").subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(4_000);
    expect(count).toBeGreaterThan(1 + Math.floor(4_000 / 1_000));
    sub.unsubscribe();
  });
});

describe("PriceHistoryPresenter buffer retention across remount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retains accumulated history when a tile unmounts and remounts (filter toggle)", () => {
    // A hot source, like the live per-symbol pricing stream: unsubscribing
    // and resubscribing does NOT replay past ticks.
    const price$ = new Subject<PriceTick>();
    const port: PricingPort = {
      getPriceUpdates: () => {
        return price$;
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceHistoryPresenter(port, of(false));
    const history$ = presenter.history$("EURUSD");

    let latest: readonly PriceTick[] = [];
    // Tile mounted (pair visible).
    const sub1 = history$.subscribe((h) => {
      latest = h;
    });
    price$.next(tick(1.1, 1));
    price$.next(tick(1.1001, 2));
    expect(latest.length).toBe(2);

    // Pair filtered out → Tile unmounts → last subscriber leaves.
    sub1.unsubscribe();
    // Let conflateWhen's timer(0) reset + refCount teardown settle.
    vi.advanceTimersByTime(10);

    // Pair filtered back in → Tile remounts → resubscribe.
    let latestAfter: readonly PriceTick[] = [];
    const sub2 = history$.subscribe((h) => {
      latestAfter = h;
    });
    price$.next(tick(1.1002, 3));

    // The chart must NOT have reset to a single fresh point — the two ticks
    // accumulated before the filter toggle are still there.
    expect(latestAfter.length).toBe(3);
    sub2.unsubscribe();
  });

  it("repaints the retained window on the FIRST frame of a remount, before any new tick", () => {
    const price$ = new Subject<PriceTick>();
    const port: PricingPort = {
      getPriceUpdates: () => {
        return price$;
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceHistoryPresenter(port, of(false));
    const history$ = presenter.history$("EURUSD");

    const sub1 = history$.subscribe();
    price$.next(tick(1.1, 1));
    price$.next(tick(1.1001, 2));
    sub1.unsubscribe();
    vi.advanceTimersByTime(10);

    // Remount: the very first emission (synchronous, before any new tick) must
    // already carry the retained history — no empty-chart frame.
    let firstAfterRemount: readonly PriceTick[] | undefined;
    const sub2 = history$.subscribe((h) => {
      firstAfterRemount ??= h;
    });
    expect(firstAfterRemount?.length).toBe(2);
    sub2.unsubscribe();
  });
});

function tick(mid: number, ts: number): PriceTick {
  return {
    symbol: "EURUSD",
    mid,
    ask: mid + 0.0001,
    bid: mid - 0.0001,
    valueDate: "2026-05-05",
    creationTimestamp: ts,
  };
}
