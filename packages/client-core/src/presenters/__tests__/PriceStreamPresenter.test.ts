import { BehaviorSubject, firstValueFrom, of, take } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CurrencyPair,
  type PriceTick,
  type PricingPort,
  PricingSimulator,
} from "@rtc/domain";

import { PriceStreamPresenter } from "../PriceStreamPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  base: "EUR",
  terms: "USD",
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
  baseMid: 1.09213,
  typicalSpreadPips: 1.4,
};

describe("PriceStreamPresenter", () => {
  it("emits a Price (enriched tick) for the given pair", async () => {
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of(tick(1.1), tick(1.1001));
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceStreamPresenter(port, of(false));
    const first = await firstValueFrom(presenter.price$(EURUSD).pipe(take(1)));
    expect(first.mid).toBe(1.1);
    expect(typeof first.spread).toBe("string");
  });

  it("returns the same Observable instance for the same symbol (cached)", () => {
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of(tick(1.1));
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: () => {
        return of({ bid: 0, ask: 0, mid: 0 });
      },
    };
    const presenter = new PriceStreamPresenter(port, of(false));
    expect(presenter.price$(EURUSD)).toBe(presenter.price$(EURUSD));
  });
});

describe("PriceStreamPresenter power-saver conflation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("conflates ticks to at most one per 250ms while power saver is on", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(true);
    const presenter = new PriceStreamPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = presenter.price$(EURUSD).subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(2_000);
    // 250ms buckets over 2s: at most 1 leading + floor(2000/250) trailing emissions.
    expect(count).toBeLessThanOrEqual(1 + Math.floor(2_000 / 250));
    sub.unsubscribe();
  });

  it("passes ticks through untouched (unconflated) while power saver is off", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(false);
    const presenter = new PriceStreamPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = presenter.price$(EURUSD).subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(2_000);
    // Unconflated simulator rate observed over 2s comfortably exceeds the
    // conflated ceiling of 9 (1 leading + 8 trailing 250ms buckets).
    expect(count).toBeGreaterThan(1 + Math.floor(2_000 / 250));
    sub.unsubscribe();
  });
});

function tick(mid: number): PriceTick {
  return {
    symbol: "EURUSD",
    mid,
    ask: mid + 0.0001,
    bid: mid - 0.0001,
    valueDate: "2026-05-05",
    creationTimestamp: 1,
  };
}
