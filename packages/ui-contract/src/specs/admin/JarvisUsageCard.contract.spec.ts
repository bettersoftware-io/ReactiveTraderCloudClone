/**
 * JarvisUsageCard contract spec (Task 10 of Phase 3, brain picker /
 * usage display). Verifies the empty ("NO USAGE DATA") placeholder and the
 * populated per-brain rows (turns / in-out tokens / cost) across both
 * windows (currentWindow / sinceBoot), plus the window-reset line's zero
 * sentinel and the "resets on server restart" caveat.
 */

import { JarvisUsageCard } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminJarvisUsagePayload } from "@rtc/client-core";

afterEach(() => {
  cleanupMounted();
});

const SNAPSHOT: AdminJarvisUsagePayload = {
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

describe("JarvisUsageCard", () => {
  it("shows NO USAGE DATA when nothing has been seeded", () => {
    const page = mount(JarvisUsageCard, {});
    expect(page.isEmpty()).toBe(true);
  });

  it("renders both windows' per-brain rows with turns/tokens/cost strings when populated", () => {
    const page = mount(JarvisUsageCard, {
      admin: { jarvisUsage: SNAPSHOT },
    });
    expect(page.isEmpty()).toBe(false);

    const current = page.rowsFor("CURRENT WINDOW");
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
      admin: {
        jarvisUsage: { ...SNAPSHOT, currentWindow: [] },
      },
    });
    expect(page.isWindowEmpty("CURRENT WINDOW")).toBe(true);
    expect(page.isWindowEmpty("SINCE BOOT")).toBe(false);
  });

  it("shows a real reset clock for a non-zero windowEndMs, and — for the zero sentinel", () => {
    const withEnd = mount(JarvisUsageCard, {
      admin: { jarvisUsage: SNAPSHOT },
    });
    // Real epoch: don't assert the exact HH:MM:SS (locale/TZ-dependent);
    // just that a real reset line — not the "—" sentinel — is rendered.
    expect(withEnd.resetLineText()).toContain("Window resets");
    expect(withEnd.resetLineText()).not.toBe("Window resets —");

    const noEnd = mount(JarvisUsageCard, {
      admin: { jarvisUsage: { ...SNAPSHOT, windowEndMs: 0 } },
    });
    expect(noEnd.resetLineText()).toBe("Window resets —");
  });

  it("renders spent-of-budget with the soft-gate mark when the payload carries budget fields", () => {
    const page = mount(JarvisUsageCard, {
      admin: {
        jarvisUsage: {
          ...SNAPSHOT,
          budgetUsd: 10,
          softBudgetUsd: 8,
          spentWindowUsd: 8.5,
          gateLevel: "soft",
        },
      },
    });
    expect(page.budgetLineText()).toContain(
      "$8.50 of $10.00 this window — soft gate at $8.00",
    );
    expect(page.gateBadgeText()).toBe("SOFT GATE");
  });

  it("renders HARD GATE and defaults spentWindowUsd/softBudgetUsd to 0 when only budgetUsd is present", () => {
    // Guards the ?? 0 defaults and the "hard" gate-badge label independently
    // of the "soft" case above — a mutant hardcoding the badge text to
    // "SOFT GATE" or flipping either `?? 0` default (e.g. to `?? 999`)
    // must fail this.
    const page = mount(JarvisUsageCard, {
      admin: {
        jarvisUsage: {
          ...SNAPSHOT,
          budgetUsd: 20,
          gateLevel: "hard",
          // spentWindowUsd / softBudgetUsd deliberately absent.
        },
      },
    });
    expect(page.budgetLineText()).toContain(
      "$0.00 of $20.00 this window — soft gate at $0.00",
    );
    expect(page.gateBadgeText()).toBe("HARD GATE");
  });

  it("renders BUDGET OFF when budgetUsd is null", () => {
    const page = mount(JarvisUsageCard, {
      admin: {
        jarvisUsage: { ...SNAPSHOT, budgetUsd: null },
      },
    });
    expect(page.budgetLineText()).toBe("BUDGET OFF");
    expect(page.gateBadgeText()).toBeNull();
  });

  it("renders no budget line at all for a pre-round payload without the fields", () => {
    const page = mount(JarvisUsageCard, {
      admin: { jarvisUsage: SNAPSHOT },
    });
    expect(page.budgetLineText()).toBeNull();
    expect(page.gateBadgeText()).toBeNull();
  });
});
