import { firstValueFrom } from "rxjs";

import { buildCurrencyPairsStream } from "#/data/currencyPairsStream";

test("emits the known currency pairs from the simulator port", async () => {
  const pairs = await firstValueFrom(buildCurrencyPairsStream());
  const symbols = pairs.map((pair) => {
    return pair.symbol;
  });
  expect(symbols).toContain("EURUSD");
  expect(pairs.length).toBeGreaterThanOrEqual(9);
});
