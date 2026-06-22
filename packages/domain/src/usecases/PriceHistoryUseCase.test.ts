import { firstValueFrom, from, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";
import type { PricingPort } from "../ports/pricingPort.js";
import { PriceHistoryUseCase } from "./PriceHistoryUseCase.js";

function stubPricing(ticks: PriceTick[]): PricingPort {
  return {
    getPriceUpdates: () => {
      return from(ticks);
    },
    getPriceHistory: () => {
      return of([] as readonly PriceTick[]);
    },
    getRfqQuote: () => {
      return of({ bid: 0, ask: 0, mid: 0 });
    },
  };
}

function tick(timestamp: number, mid: number): PriceTick {
  return {
    symbol: "EURUSD",
    bid: mid - 0.00001,
    ask: mid + 0.00001,
    mid,
    valueDate: "2024-01-02",
    creationTimestamp: timestamp,
  };
}

describe("PriceHistoryUseCase", () => {
  it("yields a growing window for the first N ticks", async () => {
    const ticks = [tick(1, 1.1), tick(2, 1.11), tick(3, 1.12)];
    const useCase = new PriceHistoryUseCase(stubPricing(ticks));

    const windows = await firstValueFrom(
      useCase.execute("EURUSD").pipe(toArray()),
    );

    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual([ticks[0]]);
    expect(windows[1]).toEqual([ticks[0], ticks[1]]);
    expect(windows[2]).toEqual([ticks[0], ticks[1], ticks[2]]);
  });

  it("caps the window at PRICE_HISTORY_SIZE, dropping the oldest tick", async () => {
    const allTicks = Array.from({ length: PRICE_HISTORY_SIZE + 3 }, (_, i) => {
      return tick(i, i);
    });
    const useCase = new PriceHistoryUseCase(stubPricing(allTicks));

    const windows = await firstValueFrom(
      useCase.execute("EURUSD").pipe(toArray()),
    );

    expect(windows).toHaveLength(PRICE_HISTORY_SIZE + 3);
    const last = windows[windows.length - 1];
    expect(last).toHaveLength(PRICE_HISTORY_SIZE);
    expect(last[0]?.creationTimestamp).toBe(3);
    expect(last[PRICE_HISTORY_SIZE - 1]?.creationTimestamp).toBe(
      PRICE_HISTORY_SIZE + 2,
    );
  });
});
