import { describe, expect, it } from "vitest";

import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeJarvisPreferencesContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("brain$, effort$ and narrator$ replay their defaults synchronously and follow their own setters independently", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.jarvisPreferences;
        const brain = collect(p.brain$);
        const effort = collect(p.effort$);
        const narrator = collect(p.narrator$);
        expect(brain.values).toEqual([DEFAULT_JARVIS_BRAIN]);
        expect(effort.values).toEqual([DEFAULT_JARVIS_EFFORT]);
        expect(narrator.values).toEqual([DEFAULT_JARVIS_NARRATOR]);
        p.setBrain("scripted");
        await settle();
        expect(brain.values.at(-1)).toBe("scripted");
        // Setting one does not emit on the others.
        expect(effort.values).toHaveLength(1);
        expect(narrator.values).toHaveLength(1);
        p.setEffort("high");
        await settle();
        expect(effort.values.at(-1)).toBe("high");
        expect(narrator.values).toHaveLength(1);
        p.setNarrator("off");
        await settle();
        expect(narrator.values.at(-1)).toBe("off");
        brain.unsubscribe();
        effort.unsubscribe();
        narrator.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays each current value synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.jarvisPreferences;
        p.setBrain("scripted");
        p.setEffort("high");
        p.setNarrator("off");
        await settle();
        const brain = collect(p.brain$);
        const effort = collect(p.effort$);
        const narrator = collect(p.narrator$);
        expect(brain.values).toEqual(["scripted"]);
        expect(effort.values).toEqual(["high"]);
        expect(narrator.values).toEqual(["off"]);
        brain.unsubscribe();
        effort.unsubscribe();
        narrator.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
