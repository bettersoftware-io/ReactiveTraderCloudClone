import { describe, expect, it } from "vitest";

import { DEFAULT_EQ_BLOTTER_VIEW } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeEqBlotterViewPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("view$ replays the default synchronously and follows setView", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqBlotterViewPreference;
        const c = collect(p.view$);
        expect(c.values).toEqual([DEFAULT_EQ_BLOTTER_VIEW]);
        p.setView("positions");
        await settle();
        expect(c.values).toEqual([DEFAULT_EQ_BLOTTER_VIEW, "positions"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current view synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqBlotterViewPreference;
        p.setView("positions");
        await settle();
        const c = collect(p.view$);
        expect(c.values).toEqual(["positions"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
