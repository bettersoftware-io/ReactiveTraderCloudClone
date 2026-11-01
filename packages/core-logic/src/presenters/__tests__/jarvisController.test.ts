import { describe, expect, it, vi } from "vitest";

import type { JarvisAvailability, JarvisState } from "@rtc/core-api";
import {
  Direction,
  type JarvisBrain,
  type JarvisBudgetView,
} from "@rtc/domain";

import { describeBrainReadout } from "#/presenters/jarvisBrainIndicators";
import {
  createJarvisController,
  formatBrainHint,
  formatGateHint,
  gateAppliesTo,
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

  it("the expiry tick for a card that is no longer pending tells the port nothing — a late tick must never decline a trade already resolved", () => {
    const controller = createJarvisController();
    const confirm = vi.fn();
    const state = createPendingState("other");

    const expiry = controller.confirmTickPatch("stale", 60, 60, confirm);

    expect(expiry(state)).toBe(state);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("the expiry tick for the pending card declines it through the port and clears it", () => {
    const controller = createJarvisController();
    const confirm = vi.fn();

    const expiry = controller.confirmTickPatch("c-1", 60, 60, confirm);

    expect(expiry(createPendingState("c-1")).pendingConfirmation).toBe(null);
    expect(confirm).toHaveBeenCalledWith("c-1", false);
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

const OWN_SONNET = "own:anthropic:claude-sonnet-5";
const RESETS_AT_MS = Date.UTC(2026, 9, 28, 0, 0, 0);

describe("createJarvisController — own brains", () => {
  it("a preference for an unoffered own brain resolves to scripted, not the default brain", () => {
    const controller = createJarvisController();
    controller.availabilityPatch(anAvailability());

    const patch = controller.preferredBrainPatch(OWN_SONNET);

    expect(patch(JARVIS_INITIAL_STATE).effectiveBrain).toBe("scripted");
  });

  it("an unoffered house brain still resolves to the default brain", () => {
    const controller = createJarvisController();
    controller.availabilityPatch(anAvailability());

    const patch = controller.preferredBrainPatch("claude-opus-5");

    expect(patch(JARVIS_INITIAL_STATE).effectiveBrain).toBe("claude-haiku-4-5");
  });

  it("a refused key keeps the own brain effective", () => {
    const controller = createJarvisController();
    controller.preferredBrainPatch(OWN_SONNET);

    const next = controller.availabilityPatch(
      anAvailability({
        brains: ["scripted", "claude-haiku-4-5", OWN_SONNET],
        ownKey: { provider: "anthropic", status: "refused", capUsd: 1 },
        ownBudget: anOwnBudget({ exhausted: null, spentUsd: 0 }),
      }),
    )(JARVIS_INITIAL_STATE);

    expect(next.effectiveBrain).toBe(OWN_SONNET);
    expect(next.ownKey?.status).toBe("refused");
  });

  it("mirrors ownKey and ownBudget into the state", () => {
    const controller = createJarvisController();
    const ownBudget = anOwnBudget({ exhausted: null });
    const ownKey = { provider: "anthropic", status: "accepted", capUsd: 1 };

    const next = controller.availabilityPatch(
      anAvailability({ ownBudget, ownKey: ownKey as never }),
    )(JARVIS_INITIAL_STATE);

    expect(next.ownBudget).toBe(ownBudget);
    expect(next.ownKey).toBe(ownKey);
  });

  it("a spent own cap that moves the person to scripted says so with 'your daily limit'", () => {
    const controller = createJarvisController();
    const talking = withConversation(OWN_SONNET);
    controller.preferredBrainPatch(OWN_SONNET);

    const next = controller.availabilityPatch(
      anAvailability({
        gate: { level: "hard", resetsAtMs: RESETS_AT_MS, gated: [OWN_SONNET] },
        ownBudget: anOwnBudget(),
        ownKey: { provider: "anthropic", status: "accepted", capUsd: 1 },
      }),
    )(talking);

    expect(next.effectiveBrain).toBe("scripted");
    expect(next.entries.at(-1)?.text).toBe(
      "Your daily limit is used — switching to the scripted brain until 00:00 UTC.",
    );
  });

  it("a spent house budget names the house when a house brain is moved", () => {
    const controller = createJarvisController();
    const talking = withConversation("claude-haiku-4-5");

    const next = controller.availabilityPatch(
      anAvailability({
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: RESETS_AT_MS,
          gated: ["claude-haiku-4-5"],
        },
        budget: {
          keyKind: "house",
          spentUsd: 1,
          limitUsd: 1,
          exhausted: "house",
          resetsAtMs: RESETS_AT_MS,
        },
        ownBudget: anOwnBudget({ exhausted: null, spentUsd: 0 }),
      }),
    )(talking);

    expect(next.entries.at(-1)?.text).toBe(
      "The house AI budget is used — switching to the scripted brain until 00:00 UTC.",
    );
  });
});

describe("formatBrainHint — which budget the gate belongs to", () => {
  it("a spent own cap says nothing about a house brain that is running", () => {
    expect(
      formatBrainHint(gate, "claude-haiku-4-5", "claude-haiku-4-5", spentOwn),
    ).toBeUndefined();
  });

  it("a spent house budget says nothing about an own brain that is running", () => {
    expect(
      formatBrainHint(gate, OWN_SONNET, OWN_SONNET, spentHouse),
    ).toBeUndefined();
  });

  it("a spent house budget does not blame the house for pausing an own preference", () => {
    expect(formatBrainHint(gate, OWN_SONNET, "scripted", spentHouse)).toBe(
      "Sonnet 5 isn't available — using scripted",
    );
  });

  it("a spent own cap names the paused own brain", () => {
    expect(formatBrainHint(gate, OWN_SONNET, "scripted", spentOwn)).toBe(
      `${formatGateHint(RESETS_AT_MS)} · Sonnet 5 paused, using scripted`,
    );
  });

  it("no budgets at all (an older server) still shows the gate copy", () => {
    expect(
      formatBrainHint(gate, "claude-haiku-4-5", "claude-haiku-4-5", {
        budget: null,
        ownBudget: null,
      }),
    ).toBe(formatGateHint(RESETS_AT_MS));
  });

  const gate = {
    level: "hard",
    resetsAtMs: RESETS_AT_MS,
    gated: [OWN_SONNET],
  } as const;

  const spentOwn = { budget: null, ownBudget: anOwnBudget() };

  const spentHouse = {
    budget: {
      keyBudget: 1,
      keyKind: "house",
      spentUsd: 1,
      limitUsd: 1,
      exhausted: "house",
      resetsAtMs: RESETS_AT_MS,
    } as unknown as JarvisBudgetView,
    ownBudget: null,
  };
});

describe("createJarvisController — a saved own preference without its key", () => {
  it("reads back as 'your key isn't set' through the controller and the readout", () => {
    const controller = createJarvisController();
    const preferred =
      controller.preferredBrainPatch(OWN_SONNET)(JARVIS_INITIAL_STATE);

    const next = controller.availabilityPatch(anAvailability())(preferred);

    expect(next.effectiveBrain).toBe("scripted");
    expect(next.preferredBrain).toBe(OWN_SONNET);
    expect(describeBrainReadout(next)?.text).toBe(
      "Scripted · your key isn't set",
    );
  });

  it("a key dropped mid-conversation says so, not 'your daily limit'", () => {
    const controller = createJarvisController();
    controller.preferredBrainPatch(OWN_SONNET);
    const talking = withConversation(OWN_SONNET);

    const next = controller.availabilityPatch(
      anAvailability({
        gate: { level: "hard", resetsAtMs: RESETS_AT_MS, gated: [] },
        ownBudget: null,
        ownKey: null,
      }),
    )({ ...talking, preferredBrain: OWN_SONNET });

    expect(next.entries.at(-1)?.text).toBe(
      "Your key isn't set — switching to the scripted brain.",
    );
  });

  it("a key dropped with no gate at all still gets the line", () => {
    const controller = createJarvisController();
    controller.preferredBrainPatch(OWN_SONNET);

    const next = controller.availabilityPatch(anAvailability())(
      withConversation(OWN_SONNET),
    );

    expect(next.entries.at(-1)?.text).toBe(
      "Your key isn't set — switching to the scripted brain.",
    );
  });
});

describe("gateAppliesTo", () => {
  it("is true only for the brain kind whose budget is spent", () => {
    const state = { budget: null, ownBudget: anOwnBudget() };

    expect(gateAppliesTo(state, OWN_SONNET)).toBe(true);
    expect(gateAppliesTo(state, "claude-haiku-4-5")).toBe(false);
  });
});

function withConversation(effectiveBrain: JarvisBrain): JarvisState {
  return {
    ...JARVIS_INITIAL_STATE,
    effectiveBrain,
    entries: [
      ...JARVIS_INITIAL_STATE.entries,
      { id: 1, role: "user", text: "hi", done: true },
    ],
  };
}

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

function anAvailability(
  overrides: Partial<JarvisAvailability> = {},
): JarvisAvailability {
  return {
    available: true,
    brains: ["scripted", "claude-haiku-4-5"],
    defaultBrain: "claude-haiku-4-5",
    gate: null,
    budget: null,
    ownBudget: null,
    ownKey: null,
    demo: false,
    ...overrides,
  };
}

function anOwnBudget(
  overrides: Partial<JarvisBudgetView> = {},
): JarvisBudgetView {
  return {
    keyKind: "own",
    spentUsd: 1,
    limitUsd: 1,
    exhausted: "user",
    resetsAtMs: RESETS_AT_MS,
    ...overrides,
  };
}
