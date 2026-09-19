import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createPositionUpdates } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeAnalyticsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("position$ has no value until the update arrives, then delivers the update itself", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.analytics.position$);
        expect(c.values).toEqual([]);
        const update = createPositionUpdates(42);
        h.driver.emitPosition(update);
        await settle();
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toBe(update);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh subscriber replays the update synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.analytics.position$);
        h.driver.emitPosition(createPositionUpdates(42));
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.positionObserved()).toBe(true);
        const again = collect(h.app.presenters.analytics.position$);
        expect(again.values).toHaveLength(1);
        expect(again.values[0]?.history[0]?.usdPnl).toBe(42);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
