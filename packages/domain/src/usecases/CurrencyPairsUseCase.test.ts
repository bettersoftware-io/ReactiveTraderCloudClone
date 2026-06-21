import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";
import { CurrencyPairsUseCase } from "./CurrencyPairsUseCase.js";

describe("CurrencyPairsUseCase", () => {
  it("delegates to ReferenceDataPort.getCurrencyPairs", async () => {
    const pairs: readonly CurrencyPair[] = [
      {
        symbol: "EURUSD",
        base: "EUR",
        terms: "USD",
        ratePrecision: 5,
        pipsPosition: 4,
        defaultNotional: 1_000_000,
      },
    ];
    const port: ReferenceDataPort = {
      getCurrencyPairs: () => of(pairs),
    };
    const useCase = new CurrencyPairsUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(pairs);
  });
});
