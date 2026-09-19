import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { EURUSD, GBPUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeCurrencyPairsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("pairs$ has no value until the roster arrives, then delivers the roster itself", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.currencyPairs.pairs$);
        expect(c.values).toEqual([]);
        const roster = [EURUSD, GBPUSD];
        h.driver.emitPairs(roster);
        await settle();
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toBe(roster);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh subscriber replays the roster synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.currencyPairs.pairs$);
        h.driver.emitPairs([EURUSD]);
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.pairsObserved()).toBe(true);
        const again = collect(h.app.presenters.currencyPairs.pairs$);
        expect(again.values).toEqual([[EURUSD]]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
