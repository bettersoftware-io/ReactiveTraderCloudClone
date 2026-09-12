import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_SKIN } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeThemeSkinPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("skin$ replays the default synchronously and follows setSkin", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themeSkinPreference;
        const c = collect(p.skin$);
        expect(c.values).toEqual([DEFAULT_THEME_SKIN]);
        p.setSkin("classic");
        expect(c.values.at(-1)).toBe("classic");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
