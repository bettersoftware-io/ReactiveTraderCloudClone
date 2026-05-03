import { describe, it, expect } from "vitest";
import { PriceHistoryUseCase } from "./price-history-use-case.js";
import type { PricingPort } from "../ports/pricingPort.js";
import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

function stubPricing(ticks: PriceTick[]): PricingPort {
  return {
    async *getPriceUpdates(_symbol: string) {
      for (const tick of ticks) yield tick;
    },
    async getPriceHistory(_symbol: string) {
      return [];
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

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("PriceHistoryUseCase", () => {
  it("yields a growing window for the first N ticks", async () => {
    const ticks = [tick(1, 1.10), tick(2, 1.11), tick(3, 1.12)];
    const useCase = new PriceHistoryUseCase(stubPricing(ticks));

    const windows = await collect(useCase.execute("EURUSD"));

    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual([ticks[0]]);
    expect(windows[1]).toEqual([ticks[0], ticks[1]]);
    expect(windows[2]).toEqual([ticks[0], ticks[1], ticks[2]]);
  });

  it("caps the window at PRICE_HISTORY_SIZE, dropping the oldest tick", async () => {
    const allTicks = Array.from({ length: PRICE_HISTORY_SIZE + 3 }, (_, i) => tick(i, i));
    const useCase = new PriceHistoryUseCase(stubPricing(allTicks));

    const windows = await collect(useCase.execute("EURUSD"));

    expect(windows).toHaveLength(PRICE_HISTORY_SIZE + 3);
    const last = windows[windows.length - 1];
    expect(last).toHaveLength(PRICE_HISTORY_SIZE);
    expect(last[0]?.creationTimestamp).toBe(3);
    expect(last[PRICE_HISTORY_SIZE - 1]?.creationTimestamp).toBe(PRICE_HISTORY_SIZE + 2);
  });
});
