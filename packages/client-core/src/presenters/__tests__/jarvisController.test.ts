import { describe, expect, it, vi } from "vitest";

import type { JarvisState } from "@rtc/core-api";
import { Direction } from "@rtc/domain";

import {
  createJarvisController,
  JARVIS_INITIAL_STATE,
} from "#/presenters/jarvisController";

// The RxJS shell's own timing never reaches these guards (takeUntil and
// switchMap stop a countdown before it can tick past its card), but a core
// whose timer races an approve does — they are the controller's promise to
// every core, so they are pinned here directly (pluggable-core slice 7
// wave 2).
describe("createJarvisController — guards every core's timing relies on", () => {
  it("a countdown tick for a confirmation that is no longer pending leaves the state alone", () => {
    const controller = createJarvisController();
    const state = createPendingState("other");

    const tick = controller.confirmTickPatch("stale", 3, 60, vi.fn());

    expect(tick(state)).toBe(state);
  });

  it("the expiry tick still declines through the port but leaves another pending card alone", () => {
    const controller = createJarvisController();
    const confirm = vi.fn();
    const state = createPendingState("other");

    const expiry = controller.confirmTickPatch("stale", 60, 60, confirm);

    expect(confirm).toHaveBeenCalledWith("stale", false);
    expect(expiry(state)).toBe(state);
  });

  it("a stray event after a turn's done changes no entry — the finished turn is no longer the target", () => {
    const controller = createJarvisController();
    const plan = controller.planTurn({ kind: "send", text: "hi" });

    if (plan === null) {
      throw new Error("expected an available controller to plan the turn");
    }

    const finished = controller.eventPatch(
      { type: "done" },
      undefined,
    )(plan.start(JARVIS_INITIAL_STATE));

    const stray = controller.eventPatch(
      { type: "delta", text: "x" },
      undefined,
    );

    expect(stray(finished).entries).toBe(finished.entries);
  });
});

function createPendingState(confirmationId: string): JarvisState {
  return {
    ...JARVIS_INITIAL_STATE,
    pendingConfirmation: {
      confirmationId,
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 5,
      remainingFraction: 1,
    },
  };
}
