import { describe, expect, it } from "vitest";

import type { JarvisDemoStep, JarvisEntry, JarvisState } from "@rtc/core-api";
import { Direction } from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { JARVIS_INITIAL_STATE } from "#/presenters/jarvisController";
import { createDemoStepWatch } from "#/presenters/jarvisDemoScript";

// The watcher every core's demo feeds; the RxJS machine's own tests cover
// it through the machine, these pin its three rules directly (pluggable-core
// slice 7 wave 2).
describe("createDemoStepWatch", () => {
  it("ignores every event until the step's own [user, jarvis] pair appears", () => {
    const watch = createDemoStepWatch(STEP, 0);

    expect(watch.observeEvent(DONE)).toBeNull();

    watch.observeState(createStateWith("someone else's turn"));

    expect(watch.observeEvent(DONE)).toBeNull();

    watch.observeState(createStateWith(STEP.command));

    expect(watch.observeEvent(DONE)).toBe("done");
  });

  it("does not count a pair at or below the watermark as this step's", () => {
    const watch = createDemoStepWatch(STEP, 2);
    watch.observeState(createStateWith(STEP.command));

    expect(watch.observeEvent(DONE)).toBeNull();
  });

  it("reports an errored turn as error", () => {
    const watch = createDemoStepWatch(STEP, 0);
    watch.observeState(createStateWith(STEP.command));

    expect(watch.observeEvent({ type: "error", message: "boom" })).toBe(
      "error",
    );
  });

  it("answers only the FIRST confirmRequest of a confirming step with decline", () => {
    const watch = createDemoStepWatch({ ...STEP, awaitsConfirmation: true }, 0);
    watch.observeState(createStateWith(STEP.command));

    expect(watch.observeEvent(CONFIRM)).toBe("decline");
    expect(watch.observeEvent(CONFIRM)).toBeNull();
  });

  it("never declines on a step that does not await a confirmation", () => {
    const watch = createDemoStepWatch(STEP, 0);
    watch.observeState(createStateWith(STEP.command));

    expect(watch.observeEvent(CONFIRM)).toBeNull();
  });
});

const STEP: JarvisDemoStep = { label: "TEST", command: "brief me" };

const DONE: JarvisEvent = { type: "done" };

const CONFIRM: JarvisEvent = {
  type: "confirmRequest",
  confirmationId: "c-1",
  symbol: "EURUSD",
  direction: Direction.Buy,
  notional: 5_000_000,
  quotedPrice: 1.1,
  ratePrecision: 5,
};

/** The greeting plus one [user, jarvis] pair (ids 1 and 2) whose user text
 * is `text`. */
function createStateWith(text: string): JarvisState {
  const user: JarvisEntry = { id: 1, role: "user", text, done: true };
  const reply: JarvisEntry = { id: 2, role: "jarvis", text: "", done: false };

  return {
    ...JARVIS_INITIAL_STATE,
    entries: [...JARVIS_INITIAL_STATE.entries, user, reply],
  };
}
