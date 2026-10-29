import { describe, expect, it } from "vitest";

import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_INDICATORS,
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
        expect(brain.values).toEqual([DEFAULT_JARVIS_BRAIN, "scripted"]);
        // Setting one does not emit on the others.
        expect(effort.values).toHaveLength(1);
        expect(narrator.values).toHaveLength(1);
        p.setEffort("high");
        await settle();
        expect(effort.values).toEqual([DEFAULT_JARVIS_EFFORT, "high"]);
        expect(narrator.values).toHaveLength(1);
        p.setNarrator("off");
        await settle();
        expect(narrator.values).toEqual([DEFAULT_JARVIS_NARRATOR, "off"]);
        brain.unsubscribe();
        effort.unsubscribe();
        narrator.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("indicators$ replays its default and follows setIndicators independently of brain$, effort$ and narrator$", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.jarvisPreferences;
        const brain = collect(p.brain$);
        const effort = collect(p.effort$);
        const narrator = collect(p.narrator$);
        const indicators = collect(p.indicators$);
        expect(indicators.values).toEqual([DEFAULT_JARVIS_INDICATORS]);
        const next = { readout: false, replyTags: true, brainPill: true };
        p.setIndicators(next);
        await settle();
        expect(indicators.values).toEqual([DEFAULT_JARVIS_INDICATORS, next]);
        expect(brain.values).toHaveLength(1);
        expect(effort.values).toHaveLength(1);
        expect(narrator.values).toHaveLength(1);
        // The other setters do not emit on indicators$.
        p.setBrain("scripted");
        p.setEffort("high");
        p.setNarrator("off");
        await settle();
        expect(indicators.values).toEqual([DEFAULT_JARVIS_INDICATORS, next]);
        brain.unsubscribe();
        effort.unsubscribe();
        narrator.unsubscribe();
        indicators.unsubscribe();
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
        const stored = { readout: false, replyTags: false, brainPill: true };
        p.setIndicators(stored);
        await settle();
        const indicators = collect(p.indicators$);
        expect(indicators.values).toEqual([stored]);
        indicators.unsubscribe();
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
