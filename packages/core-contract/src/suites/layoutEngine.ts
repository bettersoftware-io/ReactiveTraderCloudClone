import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT_ENGINE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeLayoutEngineContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("engine$ replays the default synchronously and follows setEngine", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.layoutEngine;
        const c = collect(p.engine$);
        expect(c.values).toEqual([DEFAULT_LAYOUT_ENGINE]);
        p.setEngine("dockview");
        await settle();
        expect(c.values.at(-1)).toBe("dockview");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current engine synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.layoutEngine;
        p.setEngine("dockview");
        await settle();
        const c = collect(p.engine$);
        expect(c.values).toEqual(["dockview"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
