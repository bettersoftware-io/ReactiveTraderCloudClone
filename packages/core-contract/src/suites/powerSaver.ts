import { describe, expect, it } from "vitest";

import { DEFAULT_POWER_SAVER_LEVEL } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describePowerSaverContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("level$, isCalm$ and isFreeze$ replay synchronously from the default", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.powerSaver;
        const level = collect(p.level$);
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        expect(level.values).toEqual([DEFAULT_POWER_SAVER_LEVEL]);
        expect(calm.values).toEqual([false]);
        expect(freeze.values).toEqual([false]);
        level.unsubscribe();
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("calm is any non-off level; freeze is only 'freeze'", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.powerSaver;
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        p.setLevel("calm");
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(false);
        p.setLevel("freeze");
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(true);
        p.setLevel("off");
        expect(calm.values.at(-1)).toBe(false);
        expect(freeze.values.at(-1)).toBe(false);
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
