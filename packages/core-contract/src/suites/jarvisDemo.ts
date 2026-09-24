import { describe, expect, it } from "vitest";

import type { JarvisDemoState } from "@rtc/core-api";
import { DEMO_STEP_BEAT_MS, DEMO_STEP_TIMEOUT_MS } from "@rtc/domain";

import { type FakeClock, withFakeClock } from "#/harness/clock";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import {
  clockPause,
  completeTurn,
  createConfirmRequest,
  readJarvis,
} from "#/suites/jarvisKit";
import { readLatest } from "#/suites/workspaceKit";

/** The step `JarvisDemoStep`'s doc names as the one that waits for a
 * confirmation card (and declines it), and the one that closes the overlay
 * so the drive choreography shows. */
const CONFIRMING_STEP = 6;
const OVERLAY_CLOSING_STEP = 7;

/** `presenters.jarvisDemo` — the hands-free scripted demo: one scripted turn
 * per step, a beat between steps, the one step that declines a trade card,
 * the one that closes the overlay, and every way a run ends. */
export function describeJarvisDemoContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("startDemo opens the overlay, marks step 1 in flight, and sends one scripted turn", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          const demo = await readDemo(h, clock);
          expect(demo).toMatchObject({ running: true, stepIndex: 1 });
          expect(demo.label).not.toBe(null);
          expect(demo.stepCount).toBe(OVERLAY_CLOSING_STEP);
          expect((await readJarvis(h, pause)).open).toBe(true);
          expect(
            h.driver.askLog().map((ask) => {
              return ask.options?.brain;
            }),
          ).toEqual(["scripted"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a step's done starts the next step exactly DEMO_STEP_BEAT_MS later", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await completeTurn(h, [], pause);
          await clock.advance(DEMO_STEP_BEAT_MS - 1);
          await pause();
          expect(h.driver.askLog()).toHaveLength(1);
          await clock.advance(1);
          await pause();
          expect(h.driver.askLog()).toHaveLength(2);
          expect((await readDemo(h, clock)).stepIndex).toBe(2);
        } finally {
          await h.teardown();
        }
      });
    });

    it("under power-saver freeze the next step starts with no beat", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.powerSaver.setLevel("freeze");
          await pause();
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await completeTurn(h, [], pause);
          await pause();
          expect(h.driver.askLog()).toHaveLength(2);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a full run: the confirming step's card is declined one beat later, never approved; the closing step closes the overlay; the end reopens it and resets", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await runSteps(h, clock, CONFIRMING_STEP - 1);
          h.driver.replyJarvis([createConfirmRequest("trade")]);
          await pause();
          expect(h.driver.confirmations()).toEqual([]);
          await clock.advance(DEMO_STEP_BEAT_MS);
          await pause();
          expect(h.driver.confirmations()).toEqual([
            { id: "trade", approved: false },
          ]);
          await completeTurn(h, [], pause);
          await clock.advance(DEMO_STEP_BEAT_MS);
          await pause();
          expect((await readDemo(h, clock)).stepIndex).toBe(
            OVERLAY_CLOSING_STEP,
          );
          expect((await readJarvis(h, pause)).open).toBe(false);
          await completeTurn(h, [], pause);
          await clock.advance(DEMO_STEP_BEAT_MS);
          await pause();
          expect(await readDemo(h, clock)).toEqual(createIdle());
          expect((await readJarvis(h, pause)).open).toBe(true);
          expect(h.driver.askLog()).toHaveLength(OVERLAY_CLOSING_STEP);
          expect(h.driver.confirmations()).toEqual([
            { id: "trade", approved: false },
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("an errored step aborts the run: back to idle, overlay open, no further turn", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          h.driver.replyJarvis([{ type: "error", message: "boom" }]);
          await pause();
          await clock.advance(DEMO_STEP_BEAT_MS * 2);
          await pause();
          expect(await readDemo(h, clock)).toEqual(createIdle());
          expect((await readJarvis(h, pause)).open).toBe(true);
          expect(h.driver.askLog()).toHaveLength(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a step with no settle for DEMO_STEP_TIMEOUT_MS aborts the run", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await clock.advance(DEMO_STEP_TIMEOUT_MS - 1);
          await pause();
          expect((await readDemo(h, clock)).running).toBe(true);
          await clock.advance(1);
          await pause();
          expect(await readDemo(h, clock)).toEqual(createIdle());
        } finally {
          await h.teardown();
        }
      });
    });

    it("startDemo while a run is in flight is ignored", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          expect(h.driver.askLog()).toHaveLength(1);
          expect((await readDemo(h, clock)).stepIndex).toBe(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("stopDemo mid-run returns to idle and sends nothing more", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await runSteps(h, clock, 1);
          h.app.presenters.jarvisDemo.intents.stopDemo();
          await pause();
          expect(await readDemo(h, clock)).toEqual(createIdle());
          await completeTurn(h, [], pause);
          await clock.advance(DEMO_STEP_BEAT_MS * 3);
          await pause();
          expect(h.driver.askLog()).toHaveLength(2);
        } finally {
          await h.teardown();
        }
      });
    });

    it("stopDemo while the trade card is up declines it — never approves — and no later step fires", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await runSteps(h, clock, CONFIRMING_STEP - 1);
          h.driver.replyJarvis([createConfirmRequest("trade")]);
          await pause();
          h.app.presenters.jarvisDemo.intents.stopDemo();
          await pause();
          await clock.advance(DEMO_STEP_BEAT_MS * 3);
          await pause();
          expect(h.driver.confirmations()).toEqual([
            { id: "trade", approved: false },
          ]);
          expect(h.driver.askLog()).toHaveLength(CONFIRMING_STEP);
        } finally {
          await h.teardown();
        }
      });
    });

    it("stopDemo after the overlay-closing step reopens the overlay", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.jarvisDemo.intents.startDemo();
          await pause();
          await runSteps(h, clock, OVERLAY_CLOSING_STEP - 1);
          expect((await readJarvis(h, pause)).open).toBe(false);
          h.app.presenters.jarvisDemo.intents.stopDemo();
          await pause();
          expect((await readJarvis(h, pause)).open).toBe(true);
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

function readDemo(h: CoreHarness, clock: FakeClock): Promise<JarvisDemoState> {
  return readLatest(h.app.presenters.jarvisDemo.state$, clockPause(clock));
}

/** Finish `count` steps in turn — each answered `done`, then its beat. */
async function runSteps(
  h: CoreHarness,
  clock: FakeClock,
  count: number,
): Promise<void> {
  for (let step = 0; step < count; step++) {
    await completeTurn(h, [], clockPause(clock));
    await clock.advance(DEMO_STEP_BEAT_MS);
    await clock.settle();
  }
}

function createIdle(): JarvisDemoState {
  return {
    running: false,
    stepIndex: 0,
    stepCount: OVERLAY_CLOSING_STEP,
    label: null,
  };
}
