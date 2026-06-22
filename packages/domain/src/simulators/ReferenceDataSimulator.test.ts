import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import { ReferenceDataSimulator } from "./ReferenceDataSimulator.js";

describe("ReferenceDataSimulator", () => {
  it("emits all 9 currency pairs after the 1s initial delay then completes", async () => {
    vi.useFakeTimers();
    try {
      const service = new ReferenceDataSimulator();
      const promise = firstValueFrom(
        service.getCurrencyPairs().pipe(toArray()),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      const emissions = await promise;

      expect(emissions).toHaveLength(1);
      const pairs = emissions[0];
      expect(pairs).toHaveLength(9);
      const symbols = pairs.map((p) => p.symbol);
      expect(symbols).toContain("EURUSD");
      expect(symbols).toContain("NZDUSD");
      expect(symbols).toContain("EURAUD");
    } finally {
      vi.useRealTimers();
    }
  });

  it("NZDUSD has defaultNotional of 10M", async () => {
    vi.useFakeTimers();
    try {
      const service = new ReferenceDataSimulator();
      const promise = firstValueFrom(service.getCurrencyPairs());
      await vi.advanceTimersByTimeAsync(1_000);
      const batch = await promise;

      const nzd = batch.find((p) => p.symbol === "NZDUSD");
      expect(nzd).toBeDefined();
      expect(defined(nzd).defaultNotional).toBe(10_000_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("all non-NZDUSD pairs have defaultNotional of 1M", async () => {
    vi.useFakeTimers();
    try {
      const service = new ReferenceDataSimulator();
      const promise = firstValueFrom(service.getCurrencyPairs());
      await vi.advanceTimersByTimeAsync(1_000);
      const batch = await promise;

      for (const pair of batch) {
        if (pair.symbol !== "NZDUSD") {
          expect(pair.defaultNotional).toBe(1_000_000);
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
