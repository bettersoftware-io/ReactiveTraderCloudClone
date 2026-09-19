import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_MODE_PREFERENCE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

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
        await settle();
        expect(c.values.at(-1)).toBe("light");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("cycle() walks the ring from the CURRENT stored value, not from the default", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        // "light" is NOT the default ("dark"): a cycle that ignored the stored
        // value and advanced from the default would produce "light" first
        // instead of "system", and the assertion below would see it.
        p.setMode("light");
        await settle();
        const c = collect(p.modePreference$);
        expect(c.values).toEqual(["light"]);
        p.cycle();
        p.cycle();
        p.cycle();
        await settle();
        expect(c.values).toEqual(["light", "system", "dark", "light"]);
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
        await settle();
        const c = collect(p.mode$);
        expect(c.values).toEqual(["light"]);
        h.driver.setPrefersDark(true);
        h.driver.setPrefersDark(true);
        await settle();
        expect(c.values).toEqual(["light", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
