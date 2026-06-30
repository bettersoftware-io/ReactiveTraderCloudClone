import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { CurrencyPair, ReferenceDataPort } from "@rtc/domain";

import { CurrencyPairsPresenter } from "../CurrencyPairsPresenter";

describe("CurrencyPairsPresenter", () => {
  it("exposes currency pairs", async () => {
    const pairs: readonly CurrencyPair[] = [];
    const port: ReferenceDataPort = {
      getCurrencyPairs: () => {
        return of(pairs);
      },
    };
    expect(await firstValueFrom(new CurrencyPairsPresenter(port).pairs$)).toBe(
      pairs,
    );
  });
});
