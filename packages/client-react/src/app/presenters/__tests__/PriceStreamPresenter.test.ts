import { firstValueFrom, of, take } from "rxjs";
import { describe, expect, it } from "vitest";
import type { CurrencyPair, PricingPort, PriceTick } from "@rtc/domain";
import { PriceStreamPresenter } from "../PriceStreamPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD", base: "EUR", terms: "USD",
  ratePrecision: 5, pipsPosition: 4, defaultNotional: 1_000_000,
};
const tick = (mid: number): PriceTick => ({
  symbol: "EURUSD", mid, ask: mid + 0.0001, bid: mid - 0.0001,
  valueDate: "2026-05-05", creationTimestamp: 1,
});

describe("PriceStreamPresenter", () => {
  it("emits a Price (enriched tick) for the given pair", async () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(tick(1.1), tick(1.1001)),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceStreamPresenter(port);
    const first = await firstValueFrom(presenter.price$(EURUSD).pipe(take(1)));
    expect(first.mid).toBe(1.1);
    expect(typeof first.spread).toBe("string");
  });

  it("returns the same Observable instance for the same symbol (cached)", () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(tick(1.1)),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceStreamPresenter(port);
    expect(presenter.price$(EURUSD)).toBe(presenter.price$(EURUSD));
  });
});
