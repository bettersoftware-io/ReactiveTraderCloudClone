import { firstValueFrom, from, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price, PriceTick } from "../fx/price.js";
import { PriceMovementType } from "../fx/price.js";
import type { PricingPort } from "../ports/pricingPort.js";
import { PriceStreamUseCase } from "./PriceStreamUseCase.js";

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
    getPriceUpdates: () => from(ticks),
    getPriceHistory: () => of([] as readonly PriceTick[]),
    getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
  };
}

describe("PriceStreamUseCase", () => {
  it("enriches each tick with spread and movement, tracking previous mid across ticks", async () => {
    const ticks: PriceTick[] = [
      {
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.1002,
        mid: 1.1001,
        valueDate: "2024-01-02",
        creationTimestamp: 1,
      },
      {
        symbol: "EURUSD",
        bid: 1.1001,
        ask: 1.1003,
        mid: 1.1002,
        valueDate: "2024-01-02",
        creationTimestamp: 2,
      },
      {
        symbol: "EURUSD",
        bid: 1.10005,
        ask: 1.10025,
        mid: 1.10015,
        valueDate: "2024-01-02",
        creationTimestamp: 3,
      },
    ];
    const useCase = new PriceStreamUseCase(stubPricing(ticks));

    const results: Price[] = await firstValueFrom(
      useCase.execute(EURUSD).pipe(toArray()),
    );

    expect(results).toHaveLength(3);
    expect(results[0].movementType).toBe(PriceMovementType.NONE);
    expect(results[1].movementType).toBe(PriceMovementType.UP);
    expect(results[2].movementType).toBe(PriceMovementType.DOWN);
    expect(results[0].spread).toBeCloseTo(2.0, 1);
    expect(results[0].symbol).toBe("EURUSD");
  });

  it("starts fresh on each call to execute (no shared state across calls)", async () => {
    const ticks: PriceTick[] = [
      {
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.10002,
        mid: 1.10001,
        valueDate: "2024-01-02",
        creationTimestamp: 1,
      },
    ];
    const useCase = new PriceStreamUseCase(stubPricing(ticks));

    const first = await firstValueFrom(useCase.execute(EURUSD).pipe(toArray()));
    const second = await firstValueFrom(
      useCase.execute(EURUSD).pipe(toArray()),
    );

    expect(first[0].movementType).toBe(PriceMovementType.NONE);
    expect(second[0].movementType).toBe(PriceMovementType.NONE);
  });
});
