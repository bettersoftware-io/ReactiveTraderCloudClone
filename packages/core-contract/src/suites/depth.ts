import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createDepthBook } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeDepthContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("depth$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.depth;
        expect(p.depth$("AAPL")).toBe(p.depth$("AAPL"));
        expect(p.depth$("AAPL")).not.toBe(p.depth$("MSFT"));
      } finally {
        await h.teardown();
      }
    });

    it("depth$ delivers its own symbol's books only, replays the latest to a late joiner, releases the port on the last unsubscribe, and a fresh warm period starts with no replay", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.depth;
        const aapl = collect(p.depth$("AAPL"));
        const msft = collect(p.depth$("MSFT"));
        await settle();
        const first = createDepthBook("AAPL", 100);
        h.driver.emitDepth(first);
        await settle();
        expect(aapl.values).toEqual([first]);
        expect(msft.values).toEqual([]);
        const late = collect(p.depth$("AAPL"));
        expect(late.values).toEqual([first]);
        aapl.unsubscribe();
        msft.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.depthObserved("AAPL")).toBe(false);
        const again = collect(p.depth$("AAPL"));
        expect(again.values).toEqual([]);
        await settle();
        const second = createDepthBook("AAPL", 101);
        h.driver.emitDepth(second);
        await settle();
        expect(again.values).toEqual([second]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
