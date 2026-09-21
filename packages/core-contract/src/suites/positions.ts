import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createEquityPosition } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describePositionsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("positions$ is silent until the book arrives, replays it synchronously to a late subscriber, and stays warm across zero subscribers", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.positions;
        const c = collect(p.positions$);
        expect(c.values).toEqual([]);
        const book = [createEquityPosition("AAPL")];
        h.driver.emitPositions(book);
        await settle();
        expect(c.values).toEqual([book]);
        const late = collect(p.positions$);
        expect(late.values).toEqual([book]);
        c.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.positionsObserved()).toBe(true);
        expect(c.errors).toEqual([]);
      } finally {
        await h.teardown();
      }
    });
  });
}
