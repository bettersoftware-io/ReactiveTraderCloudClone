/**
 * JarvisUsageCard contract spec (Task 10 of Phase 3, brain picker /
 * usage display). Verifies the empty ("NO USAGE DATA") placeholder and the
 * populated per-brain rows (turns / in-out tokens / cost) across both
 * windows (today's UTC day / sinceBoot), the daily house-budget line and its
 * EXHAUSTED mark, the fixed UTC reset line and the "per-model rows reset on
 * server restart" caveat.
 */

import { JarvisUsageCard } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { JarvisUsage } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("JarvisUsageCard", () => {
  it("shows NO USAGE DATA when nothing has been seeded", () => {
    const page = mount(JarvisUsageCard, {});
    expect(page.isEmpty()).toBe(true);
  });

  it("renders both windows' per-brain rows with turns/tokens/cost strings when populated", () => {
    const page = mount(JarvisUsageCard, {
      ops: { jarvisUsage: SNAPSHOT },
    });
    expect(page.isEmpty()).toBe(false);

    const current = page.rowsFor("TODAY (UTC)");
    expect(current).toHaveLength(2);
    expect(current[0]).toMatchObject({
      brainLabel: "Haiku 4.5",
      turnsText: "12 turns",
      tokensText: "3,400 in / 980 out",
      costText: "$1.00",
    });
    expect(current[1]).toMatchObject({
      brainLabel: "Opus 5",
      turnsText: "3 turns",
      tokensText: "5,200 in / 2,100 out",
      costText: "$4.50",
    });

    const boot = page.rowsFor("SINCE BOOT");
    expect(boot).toHaveLength(2);
    expect(boot[0]).toMatchObject({
      brainLabel: "Haiku 4.5",
      costText: "$10.00",
    });
    expect(boot[1]).toMatchObject({ brainLabel: "Opus 5", costText: "$45.00" });

    expect(page.hasCaveat()).toBe(true);
  });

  it("renders 'No turns yet' for a window with no rows", () => {
    const page = mount(JarvisUsageCard, {
      ops: {
        jarvisUsage: { ...SNAPSHOT, currentWindow: [] },
      },
    });
    expect(page.isWindowEmpty("TODAY (UTC)")).toBe(true);
    expect(page.isWindowEmpty("SINCE BOOT")).toBe(false);
  });

  it("states the fixed UTC midnight reset, whatever the snapshot's window bounds", () => {
    const page = mount(JarvisUsageCard, {
      ops: { jarvisUsage: SNAPSHOT },
    });
    expect(page.resetLineText()).toBe("Resets 00:00 UTC");

    const noEnd = mount(JarvisUsageCard, {
      ops: { jarvisUsage: { ...SNAPSHOT, windowEndMs: 0 } },
    });
    expect(noEnd.resetLineText()).toBe("Resets 00:00 UTC");
  });

  it("renders the house budget line with no badge while the day is under the cap", () => {
    const page = mount(JarvisUsageCard, {
      ops: {
        jarvisUsage: {
          ...SNAPSHOT,
          budgetUsd: 10,
          softBudgetUsd: null,
          spentWindowUsd: 8.5,
          gateLevel: "none",
        },
      },
    });
    expect(page.budgetLineText()).toBe(
      "$8.50 of $10.00 house budget today (UTC)",
    );
    expect(page.gateBadgeText()).toBeNull();
  });

  it("appends · EXHAUSTED when the house budget is spent (gateLevel hard)", () => {
    const page = mount(JarvisUsageCard, {
      ops: {
        jarvisUsage: {
          ...SNAPSHOT,
          budgetUsd: 20,
          softBudgetUsd: null,
          spentWindowUsd: 20.25,
          gateLevel: "hard",
        },
      },
    });
    expect(page.budgetLineText()).toContain(
      "$20.25 of $20.00 house budget today (UTC)",
    );
    expect(page.gateBadgeText()).toBe("· EXHAUSTED");
  });

  it("defaults spentWindowUsd to 0 when only budgetUsd is present", () => {
    const page = mount(JarvisUsageCard, {
      ops: { jarvisUsage: { ...SNAPSHOT, budgetUsd: 20 } },
    });
    expect(page.budgetLineText()).toBe(
      "$0.00 of $20.00 house budget today (UTC)",
    );
  });

  it("renders no budget line at all for a pre-round payload without the fields", () => {
    const page = mount(JarvisUsageCard, {
      ops: { jarvisUsage: SNAPSHOT },
    });
    expect(page.budgetLineText()).toBeNull();
    expect(page.gateBadgeText()).toBeNull();
  });
});

const SNAPSHOT: JarvisUsage = {
  windowStartMs: 1_700_000_000_000,
  windowEndMs: 1_700_000_600_000,
  currentWindow: [
    {
      brain: "claude-haiku-4-5",
      turns: 12,
      inputTokens: 3400,
      outputTokens: 980,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: 1,
    },
    {
      brain: "claude-opus-5",
      turns: 3,
      inputTokens: 5200,
      outputTokens: 2100,
      cacheReadTokens: 1024,
      cacheCreationTokens: 512,
      estimatedCostUsd: 4.5,
    },
  ],
  sinceBoot: [
    {
      brain: "claude-haiku-4-5",
      turns: 120,
      inputTokens: 34_000,
      outputTokens: 9800,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: 10,
    },
    {
      brain: "claude-opus-5",
      turns: 30,
      inputTokens: 52_000,
      outputTokens: 21_000,
      cacheReadTokens: 10_240,
      cacheCreationTokens: 5120,
      estimatedCostUsd: 45,
    },
  ],
};
