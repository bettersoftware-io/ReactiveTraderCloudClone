import { describe, expect, it, vi } from "vitest";

import type { JarvisState } from "@rtc/core-api";

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

  it("an event with no turn in flight changes no entry", () => {
    const controller = createJarvisController();

    const patch = controller.eventPatch({ type: "delta", text: "x" }, undefined);

    expect(patch(JARVIS_INITIAL_STATE).entries).toBe(
      JARVIS_INITIAL_STATE.entries,
    );
  });
});

function createPendingState(confirmationId: string): JarvisState {
  return {
    ...JARVIS_INITIAL_STATE,
    pendingConfirmation: {
      confirmationId,
      symbol: "EURUSD",
      direction: "Buy",
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 5,
      remainingFraction: 1,
    },
  };
}
