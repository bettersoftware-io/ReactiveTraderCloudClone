import { lastValueFrom, of, take, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import type { PricingPort, PriceTick } from "@rtc/domain";
import { PriceHistoryPresenter } from "../PriceHistoryPresenter";

const tick = (mid: number, ts: number): PriceTick => ({
  symbol: "EURUSD", mid, ask: mid + 0.0001, bid: mid - 0.0001,
  valueDate: "2026-05-05", creationTimestamp: ts,
});

describe("PriceHistoryPresenter", () => {
  it("accumulates live ticks into a rolling buffer", async () => {
    const t1 = tick(1.1, 1);
    const t2 = tick(1.1001, 2);
    const port: PricingPort = {
      getPriceUpdates: () => of(t1, t2),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceHistoryPresenter(port);
    // The use case emits incrementally: [t1] then [t1, t2]. take(2) + toArray collects both.
    const emissions = await lastValueFrom(presenter.history$("EURUSD").pipe(take(2), toArray()));
    expect(emissions).toEqual([[t1], [t1, t2]]);
  });

  it("caches by symbol", () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceHistoryPresenter(port);
    expect(presenter.history$("EURUSD")).toBe(presenter.history$("EURUSD"));
    expect(presenter.history$("EURUSD")).not.toBe(presenter.history$("GBPUSD"));
  });
});
