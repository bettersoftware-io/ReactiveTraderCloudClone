import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_MODE_PREFERENCE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeThemePreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("modePreference$ replays the stored choice synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        expect(c.values).toEqual([DEFAULT_THEME_MODE_PREFERENCE]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("setMode persists and emits", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        h.app.presenters.themePreference.setMode("light");
        expect(c.values.at(-1)).toBe("light");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("cycle() walks dark → light → system → dark from the CURRENT stored value", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        p.setMode("dark");
        const c = collect(p.modePreference$);
        p.cycle();
        p.cycle();
        p.cycle();
        expect(c.values).toEqual(["dark", "light", "system", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("mode$ resolves 'system' against the OS scheme and de-duplicates", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        p.setMode("system");
        const c = collect(p.mode$);
        expect(c.values).toEqual(["light"]);
        h.driver.setPrefersDark(true);
        h.driver.setPrefersDark(true);
        expect(c.values).toEqual(["light", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
