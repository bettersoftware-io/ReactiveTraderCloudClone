import { describe, expect, it } from "vitest";

import { JARVIS_BRAIN_LABELS, JARVIS_GREETING } from "@rtc/domain";

import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";
import {
  completeTurn,
  createAvailability,
  readJarvis,
  sendTurn,
} from "#/suites/jarvisKit";

/** `presenters.jarvis`'s availability fold (the port's optional
 * `availability$`), the effective brain, the budget-gate system line, and
 * the chat history it registers with the port (`setHistorySource`). */
export function describeJarvisAvailabilityCases(
  makeHarness: MakeHarness,
): void {
  describe("availability, brain and history", () => {
    it("the effective brain is the preference while it is offered, else the server's default; an availability change re-resolves it", async () => {
      const h = makeHarness({ jarvisAvailability: createAvailability() });

      try {
        h.app.presenters.jarvisPreferences.setBrain("claude-haiku-4-5");
        await settle();
        expect((await readJarvis(h)).effectiveBrain).toBe("claude-haiku-4-5");
        h.app.presenters.jarvisPreferences.setBrain("claude-sonnet-5");
        await settle();
        expect((await readJarvis(h)).effectiveBrain).toBe("scripted");
        h.driver.pushJarvisAvailability(
          createAvailability({
            brains: ["scripted", "claude-sonnet-5"],
          }),
        );
        await settle();
        const state = await readJarvis(h);
        expect(state.effectiveBrain).toBe("claude-sonnet-5");
        expect(state.brains).toEqual(["scripted", "claude-sonnet-5"]);
      } finally {
        await h.teardown();
      }
    });

    it("a gate that MOVES the effective brain after a turn appends one system line; the same gate again appends nothing", async () => {
      const h = makeHarness({ jarvisAvailability: createAvailability() });

      try {
        h.app.presenters.jarvisPreferences.setBrain("claude-haiku-4-5");
        await settle();
        await sendTurn(h, "q");
        const gated = createAvailability({
          brains: ["scripted"],
          gate: { level: "soft", resetsAtMs: 0, gated: ["claude-haiku-4-5"] },
        });
        h.driver.pushJarvisAvailability(gated);
        await settle();
        h.driver.pushJarvisAvailability(gated);
        await settle();
        const state = await readJarvis(h);
        expect(state.gate).toEqual(gated.gate);
        expect(
          state.entries.filter((entry) => {
            return entry.origin === "system";
          }),
        ).toEqual([
          {
            id: state.entries.at(-1)?.id,
            role: "jarvis",
            text: `Usage budget reached — continuing on ${JARVIS_BRAIN_LABELS.scripted}.`,
            done: true,
            origin: "system",
          },
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("a gate that leaves this session's brain alone appends nothing", async () => {
      const h = makeHarness({ jarvisAvailability: createAvailability() });

      try {
        h.app.presenters.jarvisPreferences.setBrain("scripted");
        await settle();
        await sendTurn(h, "q");
        h.driver.pushJarvisAvailability(
          createAvailability({
            brains: ["scripted"],
            gate: { level: "soft", resetsAtMs: 0, gated: ["claude-haiku-4-5"] },
          }),
        );
        await settle();
        const state = await readJarvis(h);
        expect(state.gate).not.toBe(null);
        expect(
          state.entries.some((entry) => {
            return entry.origin === "system";
          }),
        ).toBe(false);
      } finally {
        await h.teardown();
      }
    });

    it("availability going off makes send a no-op", async () => {
      const h = makeHarness();

      try {
        h.driver.pushJarvisAvailability(
          createAvailability({ available: false }),
        );
        await settle();
        h.app.presenters.jarvis.intents.send("q");
        await settle();
        expect((await readJarvis(h)).available).toBe(false);
        expect(h.driver.askLog()).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("the registered history is the finished transcript: the in-flight turn and system lines left out", async () => {
      const h = makeHarness({ jarvisAvailability: createAvailability() });

      try {
        h.app.presenters.jarvisPreferences.setBrain("claude-haiku-4-5");
        await settle();
        await sendTurn(h, "first", [{ type: "delta", text: "one" }]);
        h.driver.pushJarvisAvailability(
          createAvailability({
            brains: ["scripted"],
            gate: { level: "hard", resetsAtMs: 0, gated: ["claude-haiku-4-5"] },
          }),
        );
        await settle();
        h.app.presenters.jarvis.intents.send("second");
        await settle();
        expect(h.driver.jarvisHistory()).toEqual([
          { role: "jarvis", text: JARVIS_GREETING },
          { role: "user", text: "first" },
          { role: "jarvis", text: "one" },
        ]);
        await completeTurn(h, [{ type: "delta", text: "two" }]);
        expect(h.driver.jarvisHistory()?.slice(-2)).toEqual([
          { role: "user", text: "second" },
          { role: "jarvis", text: "two" },
        ]);
      } finally {
        await h.teardown();
      }
    });
  });
}
