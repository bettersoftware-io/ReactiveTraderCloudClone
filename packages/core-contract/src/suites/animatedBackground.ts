import { describe, expect, it } from "vitest";

import { DEFAULT_ANIMATED_BACKGROUND } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeAnimatedBackgroundContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("enabled$ replays the default synchronously, follows set, and toggle flips the SUPPLIED current", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.animatedBackground;
        const c = collect(p.enabled$);
        expect(c.values).toEqual([DEFAULT_ANIMATED_BACKGROUND]);
        p.set(false);
        await settle();
        // toggle(false) is a flip relative to the SUPPLIED current (false),
        // producing true.
        p.toggle(false);
        await settle();
        expect(c.values).toEqual([true, false, true]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current value synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.animatedBackground;
        p.set(false);
        await settle();
        const c = collect(p.enabled$);
        expect(c.values).toEqual([false]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
