import { describe, expect, it } from "vitest";

import type { JarvisBrain, JarvisBudgetView } from "@rtc/domain";

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

interface StateOverrides {
  readonly available?: boolean;
  readonly demo?: boolean;
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
  return { available: true, demo: false, effectiveBrain, budget, ...overrides };
}
