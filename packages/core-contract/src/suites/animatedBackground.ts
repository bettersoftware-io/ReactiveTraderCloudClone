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
    it("enabled$ replays the default synchronously and follows set", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.animatedBackground;
        const c = collect(p.enabled$);
        expect(c.values).toEqual([DEFAULT_ANIMATED_BACKGROUND]);
        p.set(false);
        await settle();
        expect(c.values).toEqual([DEFAULT_ANIMATED_BACKGROUND, false]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("toggle(current) flips the SUPPLIED value, not the stored one", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.animatedBackground;
        const c = collect(p.enabled$);
        expect(c.values).toEqual([DEFAULT_ANIMATED_BACKGROUND]);
        p.set(false);
        await settle();
        expect(c.values).toEqual([true, false]);
        // The supplied current (true) and the stored value (false) diverge
        // here on purpose: toggle(true) writes !true === false, which the
        // port de-duplicates against the already-stored false, so nothing
        // is emitted. A store-reading toggle would instead flip the STORED
        // false to true and emit.
        p.toggle(true);
        await settle();
        expect(c.values).toEqual([true, false]);
        p.toggle(false);
        await settle();
        // A store-based toggle would have kept flipping true→false→true→false,
        // landing on [true, false, true, false] here instead.
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
