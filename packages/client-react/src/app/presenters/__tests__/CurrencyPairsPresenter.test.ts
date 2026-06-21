import type { CurrencyPair, ReferenceDataPort } from "@rtc/domain";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { CurrencyPairsPresenter } from "../CurrencyPairsPresenter";

describe("CurrencyPairsPresenter", () => {
  it("exposes currency pairs", async () => {
    const pairs: readonly CurrencyPair[] = [];
    const port: ReferenceDataPort = { getCurrencyPairs: () => of(pairs) };
    expect(await firstValueFrom(new CurrencyPairsPresenter(port).pairs$)).toBe(
      pairs,
    );
  });
});
