import { describe, expect, it } from "vitest";

import type {
  JarvisBrain,
  JarvisBudgetView,
  JarvisOwnKeyView,
} from "@rtc/domain";

import {
  type BrainIndicatorState,
  describeBrainPill,
  describeBrainReadout,
  describeReplyTag,
  formatUsd,
} from "./jarvisBrainIndicators.js";

/** A UTC midnight, the instant the daily budget window resets. */
const MIDNIGHT_UTC_MS = Date.UTC(2026, 9, 28, 0, 0, 0);

const USED_USER = "Scripted · today's AI budget used · back at 00:00 UTC";

describe("describeBrainReadout", () => {
  it.each([
    {
      name: "demo",
      state: aState("scripted", null, { demo: true }),
      expected: {
        text: "Scripted · demo",
        tone: "normal",
        meterFraction: null,
      },
    },
    {
      name: "scripted by choice",
      state: aState("scripted", aBudget()),
      expected: { text: "Scripted", tone: "normal", meterFraction: null },
    },
    {
      name: "haiku with spend",
      state: aState("claude-haiku-4-5", aBudget()),
      expected: {
        text: "Claude Haiku 4.5 · house key · $0.14 of $0.20 left today",
        tone: "normal",
        meterFraction: 0.7,
      },
    },
    {
      name: "overshoot is clamped",
      state: aState("claude-sonnet-5", aBudget({ spentUsd: 0.25 })),
      expected: {
        text: "Claude Sonnet 5 · house key · $0.00 of $0.20 left today",
        tone: "normal",
        meterFraction: 0,
      },
    },
    {
      name: "a zero limit has no meter",
      state: aState("claude-haiku-4-5", aBudget({ limitUsd: 0, spentUsd: 0 })),
      expected: {
        text: "Claude Haiku 4.5 · house key · $0.00 of $0.00 left today",
        tone: "normal",
        meterFraction: null,
      },
    },
    {
      name: "a negative limit has no meter",
      state: aState("claude-haiku-4-5", aBudget({ limitUsd: -1, spentUsd: 0 })),
      expected: {
        text: "Claude Haiku 4.5 · house key · $0.00 of $0.00 left today",
        tone: "normal",
        meterFraction: null,
      },
    },
    {
      name: "no personal limit",
      state: aState("claude-opus-5", aBudget({ limitUsd: null })),
      expected: {
        text: "Claude Opus 5 · house key · no personal limit",
        tone: "normal",
        meterFraction: null,
      },
    },
    {
      name: "no budget",
      state: aState("claude-haiku-4-5", null),
      expected: {
        text: "Claude Haiku 4.5 · house key",
        tone: "normal",
        meterFraction: null,
      },
    },
    {
      name: "exhausted user",
      state: aState("scripted", aBudget({ exhausted: "user" })),
      expected: { text: USED_USER, tone: "warning", meterFraction: null },
    },
    {
      name: "exhausted forced",
      state: aState("scripted", aBudget({ exhausted: "forced" })),
      expected: { text: USED_USER, tone: "warning", meterFraction: null },
    },
    {
      name: "exhausted house",
      state: aState("scripted", aBudget({ exhausted: "house" })),
      expected: {
        text: "Scripted · house AI budget used · back at 00:00 UTC",
        tone: "warning",
        meterFraction: null,
      },
    },
    {
      name: "exhausted unavailable",
      state: aState("scripted", aBudget({ exhausted: "unavailable" })),
      expected: {
        text: "Scripted · AI budget unavailable",
        tone: "warning",
        meterFraction: null,
      },
    },
    {
      name: "exhausted with the zero reset sentinel drops the time",
      state: aState(
        "scripted",
        aBudget({ exhausted: "forced", resetsAtMs: 0 }),
      ),
      expected: {
        text: "Scripted · today's AI budget used",
        tone: "warning",
        meterFraction: null,
      },
    },
  ])("$name", ({ state, expected }) => {
    const readout = describeBrainReadout(state);

    expect(readout).toEqual({
      ...expected,
      meterFraction: readout?.meterFraction ?? null,
    });

    // 0.2 - 0.06 over 0.2 is 0.7000000000000001 in floating point.
    if (expected.meterFraction === null) {
      expect(readout?.meterFraction).toBeNull();
    } else {
      expect(readout?.meterFraction).toBeCloseTo(expected.meterFraction, 10);
    }
  });

  it("is null when Jarvis is unavailable", () => {
    expect(
      describeBrainReadout(
        aState("claude-haiku-4-5", aBudget(), { available: false }),
      ),
    ).toBeNull();
  });
});

describe("describeBrainPill", () => {
  it.each([
    {
      name: "spend",
      state: aState("claude-haiku-4-5", aBudget()),
      expected: "Haiku 4.5 · $0.14",
    },
    {
      name: "no budget",
      state: aState("claude-haiku-4-5", null),
      expected: "Haiku 4.5",
    },
    {
      name: "scripted",
      state: aState("scripted", aBudget()),
      expected: "Scripted",
    },
    {
      name: "overshoot",
      state: aState("claude-sonnet-5", aBudget({ spentUsd: 0.3 })),
      expected: "Sonnet 5 · $0.00",
    },
    {
      name: "no limit",
      state: aState("claude-opus-5", aBudget({ limitUsd: null })),
      expected: "Opus 5",
    },
  ])("$name", ({ state, expected }) => {
    expect(describeBrainPill(state)).toBe(expected);
  });
});

describe("describeReplyTag", () => {
  it("is the brain's full name", () => {
    expect(describeReplyTag("claude-sonnet-5")).toBe("Claude Sonnet 5");
  });
});

describe("formatUsd", () => {
  it("rounds to two decimals and clamps at zero", () => {
    expect(formatUsd(0.1399)).toBe("$0.14");
    expect(formatUsd(-0.05)).toBe("$0.00");
  });
});

describe("describeBrainReadout — an own key", () => {
  it("own, capped: the amount left of the cap, with a meter", () => {
    const state = aState(OWN_SONNET, aBudget({ exhausted: null }), {
      ownBudget: anOwnBudget(),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Sonnet 5 · your key · $0.60 of $1.00 left today",
      tone: "normal",
      meterFraction: 0.6,
    });
  });

  it("own, no limit: says no limit", () => {
    const state = aState(OWN_SONNET, null, {
      ownBudget: anOwnBudget({ limitUsd: null }),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Sonnet 5 · your key · no limit",
      tone: "normal",
      meterFraction: null,
    });
  });

  it("own key refused: a warning, while the own brain stays the effective one", () => {
    const state = aState(OWN_SONNET, null, {
      ownBudget: anOwnBudget(),
      ownKey: anOwnKey("refused"),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Anthropic refused your key",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("cap spent: scripted, naming the person's own daily limit", () => {
    const state = aState("scripted", aBudget(), {
      ownBudget: anOwnBudget({ spentUsd: 1, exhausted: "user" }),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Scripted · your daily limit used · back at 00:00 UTC",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("store unreachable, with a cap: scripted, budget unavailable", () => {
    const state = aState("scripted", aBudget(), {
      ownBudget: anOwnBudget({ exhausted: "unavailable" }),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Scripted · AI budget unavailable",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("key missing: the person prefers an own brain but no key is set", () => {
    const state = aState("scripted", null, {
      preferredBrain: OWN_SONNET,
      ownKey: null,
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Scripted · your key isn't set",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("key unreachable: names the provider that could not be reached", () => {
    const state = aState("scripted", null, {
      preferredBrain: OWN_SONNET,
      ownKey: anOwnKey("unreachable"),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Scripted · couldn't reach Anthropic",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("key checks limited: says too many key checks", () => {
    const state = aState("scripted", null, {
      preferredBrain: OWN_SONNET,
      ownKey: anOwnKey("limited"),
    });

    expect(describeBrainReadout(state)).toEqual({
      text: "Scripted · too many key checks",
      tone: "warning",
      meterFraction: null,
    });
  });

  it("a spent own cap keeps its own row for an own preference", () => {
    const state = aState("scripted", null, {
      preferredBrain: OWN_SONNET,
      ownKey: anOwnKey(),
      ownBudget: anOwnBudget({ exhausted: "user" }),
    });

    expect(describeBrainReadout(state)?.text).toBe(
      "Scripted · your daily limit used · back at 00:00 UTC",
    );
  });

  it("an own preference's missing key outranks a spent house budget", () => {
    const state = aState("scripted", aBudget({ exhausted: "house" }), {
      preferredBrain: OWN_SONNET,
      ownKey: null,
    });

    expect(describeBrainReadout(state)?.text).toBe(
      "Scripted · your key isn't set",
    );
  });

  it("a house preference that is scripted never mentions a key", () => {
    const state = aState("scripted", aBudget(), {
      preferredBrain: "claude-haiku-4-5",
      ownKey: null,
    });

    expect(describeBrainReadout(state)?.text).toBe("Scripted");
  });

  it("a spent HOUSE budget does not hide a working own key", () => {
    const state = aState(OWN_SONNET, aBudget({ exhausted: "user" }), {
      ownBudget: anOwnBudget(),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)?.text).toBe(
      "Sonnet 5 · your key · $0.60 of $1.00 left today",
    );
  });

  it("a spent own cap does not change a house brain's readout", () => {
    const state = aState("claude-haiku-4-5", aBudget(), {
      ownBudget: anOwnBudget({ exhausted: "user" }),
      ownKey: anOwnKey(),
    });

    expect(describeBrainReadout(state)?.text).toBe(
      "Claude Haiku 4.5 · house key · $0.14 of $0.20 left today",
    );
  });
});

describe("describeBrainPill — an own key", () => {
  it("shows the amount left of the person's own cap", () => {
    const state = aState(OWN_SONNET, aBudget(), {
      ownBudget: anOwnBudget(),
      ownKey: anOwnKey(),
    });

    expect(describeBrainPill(state)).toBe("Sonnet 5 · $0.60");
  });

  it("is the bare label with no own limit", () => {
    const state = aState(OWN_SONNET, aBudget(), {
      ownBudget: anOwnBudget({ limitUsd: null }),
      ownKey: anOwnKey(),
    });

    expect(describeBrainPill(state)).toBe("Sonnet 5");
  });
});

interface StateOverrides {
  readonly available?: boolean;
  readonly demo?: boolean;
  readonly ownBudget?: JarvisBudgetView | null;
  readonly ownKey?: JarvisOwnKeyView | null;
  readonly preferredBrain?: JarvisBrain;
}

function aBudget(overrides: Partial<JarvisBudgetView> = {}): JarvisBudgetView {
  return {
    keyKind: "house",
    spentUsd: 0.06,
    limitUsd: 0.2,
    exhausted: null,
    resetsAtMs: MIDNIGHT_UTC_MS,
    ...overrides,
  };
}

function aState(
  effectiveBrain: JarvisBrain,
  budget: JarvisBudgetView | null,
  overrides: StateOverrides = {},
): BrainIndicatorState {
  return {
    available: true,
    demo: false,
    effectiveBrain,
    preferredBrain: effectiveBrain,
    budget,
    ownBudget: null,
    ownKey: null,
    ...overrides,
  };
}

const OWN_SONNET: JarvisBrain = "own:anthropic:claude-sonnet-5";

function anOwnBudget(
  overrides: Partial<JarvisBudgetView> = {},
): JarvisBudgetView {
  return {
    keyKind: "own",
    spentUsd: 0.4,
    limitUsd: 1,
    exhausted: null,
    resetsAtMs: MIDNIGHT_UTC_MS,
    ...overrides,
  };
}

function anOwnKey(
  status: JarvisOwnKeyView["status"] = "accepted",
): JarvisOwnKeyView {
  return { provider: "anthropic", status, capUsd: 1 };
}
