import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW_MODE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeViewModePreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("viewMode$ replays the default synchronously and follows setViewMode", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.viewModePreference;
        const c = collect(p.viewMode$);
        expect(c.values).toEqual([DEFAULT_VIEW_MODE]);
        p.setViewMode("price");
        expect(c.values.at(-1)).toBe("price");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
