import { describe, it, expect } from "vitest";
import { PriceStreamUseCase } from "./PriceStreamUseCase.js";
import type { PricingPort } from "../ports/pricingPort.js";
import type { PriceTick, Price } from "../fx/price.js";
import { PriceMovementType } from "../fx/price.js";
import type { CurrencyPair } from "../fx/currencyPair.js";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
};

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

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("PriceStreamUseCase", () => {
  it("enriches each tick with spread and movement, tracking previous mid across ticks", async () => {
    const ticks: PriceTick[] = [
      { symbol: "EURUSD", bid: 1.10000, ask: 1.10020, mid: 1.10010, valueDate: "2024-01-02", creationTimestamp: 1 },
      { symbol: "EURUSD", bid: 1.10010, ask: 1.10030, mid: 1.10020, valueDate: "2024-01-02", creationTimestamp: 2 },
      { symbol: "EURUSD", bid: 1.10005, ask: 1.10025, mid: 1.10015, valueDate: "2024-01-02", creationTimestamp: 3 },
    ];
    const useCase = new PriceStreamUseCase(stubPricing(ticks));

    const results: Price[] = await collect(useCase.execute(EURUSD));

    expect(results).toHaveLength(3);
    expect(results[0].movementType).toBe(PriceMovementType.NONE);
    expect(results[1].movementType).toBe(PriceMovementType.UP);
    expect(results[2].movementType).toBe(PriceMovementType.DOWN);
    expect(results[0].spread).toBeCloseTo(2.0, 1);
    expect(results[0].symbol).toBe("EURUSD");
  });

  it("starts fresh on each call to execute (no shared state across calls)", async () => {
    const ticks: PriceTick[] = [
      { symbol: "EURUSD", bid: 1.10000, ask: 1.10002, mid: 1.10001, valueDate: "2024-01-02", creationTimestamp: 1 },
    ];
    const useCase = new PriceStreamUseCase(stubPricing(ticks));

    const first = await collect(useCase.execute(EURUSD));
    const second = await collect(useCase.execute(EURUSD));

    expect(first[0].movementType).toBe(PriceMovementType.NONE);
    expect(second[0].movementType).toBe(PriceMovementType.NONE);
  });
});
