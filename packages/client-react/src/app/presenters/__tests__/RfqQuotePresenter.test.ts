import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PricingPort, RfqQuoteResult } from "@rtc/domain";

import { RfqQuotePresenter } from "../RfqQuotePresenter";

describe("RfqQuotePresenter", () => {
  it("delegates to PricingPort.getRfqQuote", async () => {
    const result: RfqQuoteResult = { bid: 1.099, ask: 1.101, mid: 1.1 };
    let calledWith: QuoteCall | null = null;
    const port: PricingPort = {
      getPriceUpdates: () => {
        return of();
      },
      getPriceHistory: () => {
        return of([]);
      },
      getRfqQuote: (symbol: string, pipsPosition: number) => {
        calledWith = { symbol, pipsPosition };
        return of(result);
      },
    };
    const presenter = new RfqQuotePresenter(port);
    expect(await firstValueFrom(presenter.requestQuote("EURUSD", 4))).toBe(
      result,
    );
    expect(calledWith).toEqual({ symbol: "EURUSD", pipsPosition: 4 });
  });
});

interface QuoteCall {
  symbol: string;
  pipsPosition: number;
}
