import { describe, expect, it } from "vitest";

import type { JarvisAvailability } from "@rtc/core-api";
import {
  JARVIS_NARRATION_PREFIX,
  type JarvisBrain,
  type JarvisOwnKeyStatus,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import type { MakeHarness } from "#/harness/harness";
import {
  clockPause,
  completeTurn,
  createAvailability,
  NARRATOR_BASELINE_TICKS,
  NARRATOR_TEST_CONFIG,
  narrationAsks,
  publishNarratedPair,
  pushBaselineTicks,
  pushSpreadSpike,
} from "#/suites/jarvisKit";

const OWN_BRAIN: JarvisBrain = "own:anthropic:claude-sonnet-5";

/** The pinned narration copy: the prefix, the symbol, the channel ("spread
 * widened" for this spread spike), the size to one decimal, the window. */
const NARRATION_FORMAT = new RegExp(
  `^${escapeRegExp(JARVIS_NARRATION_PREFIX)}EURUSD spread widened \\d+\\.\\dσ over the last window\\.$`,
);

/** The narrator — internal, no presenter of its own: an anomaly on a
 * published pair's prices becomes a `narrate()` turn, gated by the user's
 * preference, a cooldown and a per-session cap. */
export function describeJarvisNarratorCases(makeHarness: MakeHarness): void {
  describe("narrator", () => {
    it("a spread spike with the narrator on asks exactly one narration", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ narratorConfig: NARRATOR_TEST_CONFIG });
        const pause = clockPause(clock);

        try {
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          const asked = narrationAsks(h, JARVIS_NARRATION_PREFIX);
          expect(asked).toHaveLength(1);
          expect(asked[0]).toMatch(NARRATION_FORMAT);
        } finally {
          await h.teardown();
        }
      });
    });

    it("with the narrator off, a spike asks nothing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ narratorConfig: NARRATOR_TEST_CONFIG });
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisPreferences.setNarrator("off");
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(h.driver.askLog()).toEqual([]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a refused key on an own brain asks nothing, and costs no cooldown: accepted again, the next spike narrates", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({
          narratorConfig: NARRATOR_TEST_CONFIG,
          jarvisAvailability: createOwnBrainAvailability("refused"),
        });
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisPreferences.setBrain(OWN_BRAIN);
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(h.driver.askLog()).toEqual([]);
          h.driver.pushJarvisAvailability(
            createOwnBrainAvailability("accepted"),
          );
          await pause();
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("an accepted key on an own brain narrates", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({
          narratorConfig: NARRATOR_TEST_CONFIG,
          jarvisAvailability: createOwnBrainAvailability("accepted"),
        });
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisPreferences.setBrain(OWN_BRAIN);
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a refused key with a house brain in use still narrates", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({
          narratorConfig: NARRATOR_TEST_CONFIG,
          jarvisAvailability: createOwnBrainAvailability("refused"),
        });
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisPreferences.setBrain("claude-haiku-4-5");
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a second anomaly inside the cooldown is dropped; one after it narrates", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ narratorConfig: NARRATOR_TEST_CONFIG });
        const pause = clockPause(clock);

        try {
          await publishNarratedPair(h, pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          await completeTurn(h, [], pause);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(1);
          await clock.advance(NARRATION_COOLDOWN_MS);
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(2);
        } finally {
          await h.teardown();
        }
      });
    });

    it("narrations stop for good at MAX_NARRATIONS_PER_SESSION", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ narratorConfig: NARRATOR_TEST_CONFIG });
        const pause = clockPause(clock);

        try {
          await publishNarratedPair(h, pause);

          for (let n = 0; n <= MAX_NARRATIONS_PER_SESSION; n++) {
            pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
            pushSpreadSpike(h);
            await pause();
            await completeTurn(h, [], pause);
            await clock.advance(NARRATION_COOLDOWN_MS);
          }

          expect(narrationAsks(h, JARVIS_NARRATION_PREFIX)).toHaveLength(
            MAX_NARRATIONS_PER_SESSION,
          );
        } finally {
          await h.teardown();
        }
      });
    });

    it("an anomaly during the user's own turn queues behind it: one ask at a time, the narration next", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ narratorConfig: NARRATOR_TEST_CONFIG });
        const pause = clockPause(clock);

        try {
          await publishNarratedPair(h, pause);
          h.app.presenters.jarvis.intents.send("mine");
          await pause();
          pushBaselineTicks(h, NARRATOR_BASELINE_TICKS);
          pushSpreadSpike(h);
          await pause();
          expect(h.driver.pendingAsks()).toEqual(["mine"]);
          await completeTurn(h, [], pause);
          const pending = h.driver.pendingAsks();
          expect(pending).toHaveLength(1);
          expect(pending[0]?.startsWith(JARVIS_NARRATION_PREFIX)).toBe(true);
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

function createOwnBrainAvailability(
  status: JarvisOwnKeyStatus,
): JarvisAvailability {
  return createAvailability({
    brains: ["scripted", "claude-haiku-4-5", OWN_BRAIN],
    ownKey: { provider: "anthropic", status, capUsd: 1 },
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
