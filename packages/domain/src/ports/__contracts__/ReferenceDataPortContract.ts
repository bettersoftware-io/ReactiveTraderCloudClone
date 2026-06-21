import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { ReferenceDataPort } from "../referenceDataPort.js";

export interface ReferenceDataDriver {
  /** Cause the port to emit its first (or only) snapshot. */
  snapshotPairs(): Promise<void>;
}

export interface ReferenceDataHarness {
  port: ReferenceDataPort;
  driver: ReferenceDataDriver;
  teardown: () => void;
}

export function describeReferenceDataPortContract(
  label: string,
  makeHarness: () => ReferenceDataHarness,
): void {
  describe(`${label} :: ReferenceDataPort contract`, () => {
    it("emits at least one snapshot containing the canonical pairs", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getCurrencyPairs());
        await driver.snapshotPairs();
        const pairs = await promise;
        expect(pairs.length).toBeGreaterThan(0);
        const symbols = pairs.map((p) => p.symbol);
        expect(symbols).toContain("EURUSD");
        expect(symbols).toContain("GBPUSD");
        expect(symbols).toContain("NZDUSD");
      } finally {
        teardown();
      }
    });

    it("each pair has full shape", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getCurrencyPairs());
        await driver.snapshotPairs();
        const pairs = await promise;
        for (const pair of pairs) {
          expect(typeof pair.symbol).toBe("string");
          expect(typeof pair.base).toBe("string");
          expect(typeof pair.terms).toBe("string");
          expect(typeof pair.ratePrecision).toBe("number");
          expect(typeof pair.pipsPosition).toBe("number");
          expect(typeof pair.defaultNotional).toBe("number");
        }
      } finally {
        teardown();
      }
    });

    it("NZDUSD.defaultNotional === 10_000_000 (the divergent rule)", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getCurrencyPairs());
        await driver.snapshotPairs();
        const pairs = await promise;
        const nzdusd = pairs.find((p) => p.symbol === "NZDUSD");
        expect(nzdusd?.defaultNotional).toBe(10_000_000);
      } finally {
        teardown();
      }
    });
  });
}
