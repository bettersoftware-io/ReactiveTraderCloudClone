import { describe, it, expect } from "vitest";
import { ReferenceDataSimulator } from "./reference-data-simulator.js";

describe("ReferenceDataSimulator", () => {
  it("emits all 9 currency pairs", async () => {
    const service = new ReferenceDataSimulator();
    const pairs: any[] = [];

    for await (const batch of service.getCurrencyPairs()) {
      pairs.push(...batch);
      break; // only one emission expected
    }

    expect(pairs).toHaveLength(9);
    const symbols = pairs.map((p) => p.symbol);
    expect(symbols).toContain("EURUSD");
    expect(symbols).toContain("NZDUSD");
    expect(symbols).toContain("EURAUD");
  });

  it("NZDUSD has defaultNotional of 10M", async () => {
    const service = new ReferenceDataSimulator();

    for await (const batch of service.getCurrencyPairs()) {
      const nzd = batch.find((p) => p.symbol === "NZDUSD");
      expect(nzd).toBeDefined();
      expect(nzd!.defaultNotional).toBe(10_000_000);
      break;
    }
  });

  it("all non-NZDUSD pairs have defaultNotional of 1M", async () => {
    const service = new ReferenceDataSimulator();

    for await (const batch of service.getCurrencyPairs()) {
      for (const pair of batch) {
        if (pair.symbol !== "NZDUSD") {
          expect(pair.defaultNotional).toBe(1_000_000);
        }
      }
      break;
    }
  });
});
