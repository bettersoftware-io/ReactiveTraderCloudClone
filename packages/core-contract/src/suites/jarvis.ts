import { describe, expect, it } from "vitest";

import type { JarvisEntry } from "@rtc/core-api";
import {
  DEFAULT_JARVIS_SKIN,
  JARVIS_GREETING,
  JARVIS_NARRATION_PREFIX,
  JARVIS_SKINS,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import type { JarvisEvent } from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";
import { describeJarvisAvailabilityCases } from "#/suites/jarvisAvailability";
import { describeJarvisConfirmationCases } from "#/suites/jarvisConfirmation";
import {
  completeTurn,
  createAvailability,
  entryTexts,
  lastEntry,
  readJarvis,
  sendTurn,
} from "#/suites/jarvisKit";
import { describeJarvisNarratorCases } from "#/suites/jarvisNarrator";

/** `presenters.jarvis` — the chat transcript and its turn queue, the
 * overlay, the confirmation card, the brain/availability fold, the history
 * the port replays, the drive-outcome rows, and the narrator that speaks up
 * unprompted (internal: its only output is a narration turn). */
export function describeJarvisContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    describeJarvisTurnCases(makeHarness);
    describeJarvisOverlayCases(makeHarness);
    describeJarvisConfirmationCases(makeHarness);
    describeJarvisAvailabilityCases(makeHarness);
    describeJarvisNarratorCases(makeHarness);
  });
}

function describeJarvisTurnCases(makeHarness: MakeHarness): void {
  describe("turns", () => {
    it("the transcript starts with the greeting alone, idle and closed", async () => {
      const h = makeHarness();

      try {
        const state = await readJarvis(h);
        expect(state.entries).toEqual([
          { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
        ]);
        expect(state).toMatchObject({
          open: false,
          phase: "idle",
          unread: 0,
          unreadNarration: false,
          openCount: 0,
          pendingConfirmation: null,
          skin: DEFAULT_JARVIS_SKIN,
        });
      } finally {
        await h.teardown();
      }
    });

    it("send appends the user entry and an empty streaming stub, speaks, and asks once with the effective brain and the effort preference", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvisPreferences.setEffort("high");
        await settle();
        h.app.presenters.jarvis.intents.send("hi");
        await settle();
        const state = await readJarvis(h);
        expect(state.phase).toBe("speaking");
        expect(state.entries.slice(1)).toEqual([
          { id: state.entries[1]?.id, role: "user", text: "hi", done: true },
          { id: state.entries[2]?.id, role: "jarvis", text: "", done: false },
        ]);
        expect(h.driver.askLog()).toEqual([
          {
            text: "hi",
            options: { brain: state.effectiveBrain, effort: "high" },
          },
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("deltas stream into the stub, a tool event marks it, and done settles it and idles", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.send("price?");
        await settle();
        h.driver.replyJarvis([
          { type: "delta", text: "Hel" },
          { type: "delta", text: "lo" },
          { type: "toolEvent", tool: "get_price", status: "running" },
        ]);
        await settle();
        expect(await lastEntry(h)).toMatchObject({
          role: "jarvis",
          text: "Hello",
          done: false,
          tool: { name: "get_price", status: "running" },
        });
        await completeTurn(h);
        expect(await lastEntry(h)).toMatchObject({ text: "Hello", done: true });
        expect((await readJarvis(h)).phase).toBe("idle");
      } finally {
        await h.teardown();
      }
    });

    it("an error replaces the stub's text with the message, drops its tool, and idles", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.send("price?");
        await settle();
        h.driver.replyJarvis([
          { type: "toolEvent", tool: "get_price", status: "running" },
          { type: "error", message: "boom" },
        ]);
        await settle();
        const entry = await lastEntry(h);
        expect(entry).toMatchObject({ text: "boom", done: true });
        expect("tool" in entry).toBe(false);
        expect((await readJarvis(h)).phase).toBe("idle");
      } finally {
        await h.teardown();
      }
    });

    it("a second send during a turn asks nothing until the first turn is done, and its deltas never touch the first reply", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.send("a");
        h.app.presenters.jarvis.intents.send("b");
        await settle();
        expect(h.driver.pendingAsks()).toEqual(["a"]);
        await completeTurn(h, [{ type: "delta", text: "A" }]);
        expect(h.driver.pendingAsks()).toEqual(["b"]);
        await completeTurn(h, [{ type: "delta", text: "B" }]);
        expect(await entryTexts(h)).toEqual([
          JARVIS_GREETING,
          "a",
          "A",
          "b",
          "B",
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("three queued turns whose middle one errors: each reply lands on its own turn, and the third still runs", async () => {
      const h = makeHarness();

      try {
        for (const text of ["a", "b", "c"]) {
          h.app.presenters.jarvis.intents.send(text);
        }

        await settle();
        await completeTurn(h, [{ type: "delta", text: "A" }]);
        h.driver.replyJarvis([{ type: "error", message: "B failed" }]);
        await settle();
        expect(h.driver.pendingAsks()).toEqual(["c"]);
        await completeTurn(h, [{ type: "delta", text: "C" }]);
        expect(await entryTexts(h)).toEqual([
          JARVIS_GREETING,
          "a",
          "A",
          "b",
          "B failed",
          "c",
          "C",
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("send while unavailable is a silent no-op: no entry, no ask", async () => {
      const h = makeHarness({
        jarvisAvailability: createAvailability({ available: false }),
      });

      try {
        await settle();
        h.app.presenters.jarvis.intents.send("hello?");
        await settle();
        const state = await readJarvis(h);
        expect(state.available).toBe(false);
        expect(state.entries).toHaveLength(1);
        expect(h.driver.askLog()).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("narrate asks with the prefixed prompt as given; the transcript shows it unprefixed, marked narrator", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.narrate(
          `${JARVIS_NARRATION_PREFIX}EURUSD moved`,
        );
        await settle();
        expect(h.driver.pendingAsks()).toEqual([
          `${JARVIS_NARRATION_PREFIX}EURUSD moved`,
        ]);
        const user = (await readJarvis(h)).entries[1];
        expect(user).toMatchObject({
          role: "user",
          text: "EURUSD moved",
          origin: "narrator",
        });
      } finally {
        await h.teardown();
      }
    });

    it("sendScripted pins the turn's brain to scripted and leaves origin unset; send keeps the effective brain", async () => {
      // Haiku is offered but not the server default, so an ask carrying it
      // proves the preference was resolved, not defaulted.
      const h = makeHarness({ jarvisAvailability: createAvailability() });

      try {
        h.app.presenters.jarvisPreferences.setBrain("claude-haiku-4-5");
        await settle();
        await sendTurn(h, "normal");
        h.app.presenters.jarvis.intents.sendScripted("demo");
        await settle();
        expect(
          h.driver.askLog().map((ask) => {
            return ask.options?.brain;
          }),
        ).toEqual(["claude-haiku-4-5", "scripted"]);
        const user = (await readJarvis(h)).entries.at(-2);
        expect(user).toMatchObject({ role: "user", text: "demo" });
        expect(user && "origin" in user).toBe(false);
      } finally {
        await h.teardown();
      }
    });

    it("events$ delivers each turn event once, in order, and replays nothing to a late subscriber", async () => {
      const h = makeHarness();

      try {
        const early = collect(h.app.presenters.jarvis.events$);
        const turn: readonly JarvisEvent[] = [
          { type: "delta", text: "x" },
          { type: "done" },
        ];
        h.app.presenters.jarvis.intents.send("q");
        await settle();
        h.driver.replyJarvis(turn);
        await settle();
        const late = collect(h.app.presenters.jarvis.events$);
        await settle();
        expect(early.values).toEqual(turn);
        expect(late.values).toEqual([]);
        early.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("recordDriveOutcome appends 'drive: <kind>' for applied, \"can't <op>: <reason>\" for refused, and nothing for skipped", async () => {
      const h = makeHarness();

      try {
        const record = h.app.presenters.jarvis.intents.recordDriveOutcome;
        record({
          command: { kind: "switchTab", tab: "credit" },
          status: "applied",
        });
        record({
          command: { kind: "switchTab", tab: "admin" },
          status: "skipped",
          reason: "noop",
        });
        record({
          command: {
            kind: "layout",
            tab: "fx",
            op: "maximize",
            panelId: "fx-rates",
          },
          status: "refused",
          reason: "fx-rates is floating",
        });
        await settle();
        const rows = (await readJarvis(h)).entries.slice(1);
        expect(
          rows.map((row: JarvisEntry) => {
            return [row.role, row.text, row.done];
          }),
        ).toEqual([
          ["jarvis", "drive: switchTab", true],
          ["jarvis", "can't maximize: fx-rates is floating", true],
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("a row appended mid-turn does not hijack the streaming reply: later deltas and the done still land on the turn's own stub", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.send("go");
        await settle();
        h.driver.replyJarvis([{ type: "delta", text: "a" }]);
        await settle();
        h.app.presenters.jarvis.intents.recordDriveOutcome({
          command: { kind: "switchTab", tab: "credit" },
          status: "applied",
        });
        await settle();
        await completeTurn(h, [{ type: "delta", text: "b" }]);
        const rows = (await readJarvis(h)).entries.slice(1);
        expect(
          rows.map((row: JarvisEntry) => {
            return [row.role, row.text, row.done];
          }),
        ).toEqual([
          ["user", "go", true],
          ["jarvis", "ab", true],
          ["jarvis", "drive: switchTab", true],
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("skin follows the stored preference, and setSkin writes it", async () => {
      const h = makeHarness();

      try {
        const next = JARVIS_SKINS.find((skin) => {
          return skin !== DEFAULT_JARVIS_SKIN;
        });

        if (next === undefined) {
          throw new Error("expected a second Jarvis skin");
        }

        h.app.presenters.jarvis.intents.setSkin(next);
        await settle();
        expect((await readJarvis(h)).skin).toBe(next);
      } finally {
        await h.teardown();
      }
    });
  });
}

function describeJarvisOverlayCases(makeHarness: MakeHarness): void {
  describe("overlay", () => {
    it("open counts closed→open transitions only; close keeps the count; toggle goes both ways", async () => {
      const h = makeHarness();

      try {
        const intents = h.app.presenters.jarvis.intents;
        const counts: [boolean, number][] = [];

        for (const act of [
          intents.open,
          intents.open,
          intents.close,
          intents.toggle,
          intents.toggle,
        ]) {
          act();
          await settle();
          const state = await readJarvis(h);
          counts.push([state.open, state.openCount]);
        }

        expect(counts).toEqual([
          [true, 1],
          [true, 1],
          [false, 1],
          [true, 2],
          [false, 2],
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("a turn done while closed counts one unread; opening — by open or by toggle — clears it", async () => {
      const h = makeHarness();

      try {
        await sendTurn(h, "q");
        expect((await readJarvis(h)).unread).toBe(1);
        h.app.presenters.jarvis.intents.open();
        await settle();
        expect((await readJarvis(h)).unread).toBe(0);
        h.app.presenters.jarvis.intents.close();
        await sendTurn(h, "again");
        expect((await readJarvis(h)).unread).toBe(1);
        h.app.presenters.jarvis.intents.toggle();
        await settle();
        expect((await readJarvis(h)).unread).toBe(0);
      } finally {
        await h.teardown();
      }
    });

    it("a narration done while closed raises the narration flare; while open it does not; opening clears it", async () => {
      const h = makeHarness();

      try {
        const intents = h.app.presenters.jarvis.intents;
        intents.narrate(`${JARVIS_NARRATION_PREFIX}one`);
        await settle();
        await completeTurn(h);
        expect((await readJarvis(h)).unreadNarration).toBe(true);
        intents.open();
        await settle();
        expect((await readJarvis(h)).unreadNarration).toBe(false);
        intents.narrate(`${JARVIS_NARRATION_PREFIX}two`);
        await settle();
        await completeTurn(h);
        const state = await readJarvis(h);
        expect(state.unreadNarration).toBe(false);
        expect(state.unread).toBe(0);
      } finally {
        await h.teardown();
      }
    });
  });
}
