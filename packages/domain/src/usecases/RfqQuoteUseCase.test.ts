import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";
import { RfqQuoteUseCase } from "./RfqQuoteUseCase.js";

describe("RfqQuoteUseCase", () => {
  it("delegates to PricingPort.getRfqQuote with symbol + pipsPosition", async () => {
    const expected: RfqQuoteResult = { bid: 1.099, ask: 1.101, mid: 1.1 };
    let calledWith: { symbol: string; pipsPosition: number } | null = null;
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of();
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: (symbol: string, pipsPosition: number) => {
        calledWith = { symbol, pipsPosition };
        return of(expected);
      },
    };
    const useCase = new RfqQuoteUseCase(port);
    const result = await firstValueFrom(useCase.execute("EURUSD", 4));
    expect(calledWith).toEqual({ symbol: "EURUSD", pipsPosition: 4 });
    expect(result).toBe(expected);
  });
});
