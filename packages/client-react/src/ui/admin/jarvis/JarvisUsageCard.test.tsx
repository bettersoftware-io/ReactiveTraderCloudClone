/**
 * Co-located unit test for the Jarvis Admin usage card. No shared ui-contract
 * spec exists yet for this surface (Task 10), and no neighboring admin card
 * (LatencyHistogram/ServiceHealth/LiveEventLog) has its own co-located test
 * either — but this component has enough real branch logic (null vs
 * populated, per-section empty lists, the windowEndMs=0 sentinel) to be
 * worth pinning directly rather than leaving to a future contract spec.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/client-core";

import { jarvisUsageCardPage } from "#tests/ui/pages/JarvisUsageCardPage";

const page = jarvisUsageCardPage();

afterEach(() => {
  page.unmountAll();
});

describe("JarvisUsageCard", () => {
  it("shows NO USAGE DATA when useJarvisUsage() is null", () => {
    page.mount(null);

    expect(page.text("admin-jarvis-usage-card")).toContain("NO USAGE DATA");
  });

  it("renders per-brain rows for both windows, plus the reset time and caveat", () => {
    page.mount({
      windowStartMs: 1_000,
      windowEndMs: 1_735_689_000_000, // 2025-01-01T00:10:00.000Z-ish, fixed for a deterministic clock() read
      currentWindow: [
        {
          brain: "claude-haiku-4-5",
          turns: 3,
          inputTokens: 1200,
          outputTokens: 400,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCostUsd: 0.12,
        },
      ],
      sinceBoot: [
        {
          brain: "claude-haiku-4-5",
          turns: 30,
          inputTokens: 12000,
          outputTokens: 4000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCostUsd: 1.2,
        },
        {
          brain: "claude-opus-5",
          turns: 2,
          inputTokens: 500,
          outputTokens: 900,
          cacheReadTokens: 300,
          cacheCreationTokens: 50,
          estimatedCostUsd: 4.5,
        },
      ],
    });

    const cardText = page.text("admin-jarvis-usage-card");
    expect(cardText).toContain("Haiku 4.5");
    expect(cardText).toContain("Opus 5");
    expect(cardText).toContain("$0.12");
    expect(cardText).toContain("$1.20");
    expect(cardText).toContain("$4.50");
    expect(cardText).toContain("Window resets");
    expect(cardText).not.toContain("Window resets —");
    expect(cardText).toContain("resets on server restart");
  });

  it("prints — instead of a bogus epoch clock when windowEndMs is the 0 sentinel", () => {
    page.mount({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });

    const cardText = page.text("admin-jarvis-usage-card");
    expect(cardText).toContain("Window resets —");
    expect(cardText).toContain("No turns yet");
  });

  it("renders no budget line on a pre-round server (budgetUsd absent)", () => {
    page.mount({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });

    expect(page.exists("admin-jarvis-budget-line")).toBe(false);
  });

  it("renders BUDGET OFF when budgetUsd is null (gating disabled)", () => {
    page.mount({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
      budgetUsd: null,
    } as JarvisUsageSnapshot);

    expect(page.text("admin-jarvis-budget-line")).toBe("BUDGET OFF");
    expect(page.exists("admin-jarvis-gate-badge")).toBe(false);
  });

  it("renders the spend/budget/soft-gate line and a SOFT GATE badge", () => {
    page.mount({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
      budgetUsd: 10,
      softBudgetUsd: 8,
      spentWindowUsd: 8.5,
      gateLevel: "soft",
    } as JarvisUsageSnapshot);

    expect(page.text("admin-jarvis-budget-line")).toContain(
      "$8.50 of $10.00 this window — soft gate at $8.00",
    );
    expect(page.text("admin-jarvis-gate-badge")).toBe("SOFT GATE");
    expect(page.attribute("admin-jarvis-gate-badge", "data-gate")).toBe("soft");
  });

  it("renders a HARD GATE badge and defaults spent/soft-budget when absent", () => {
    page.mount({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
      budgetUsd: 10,
      gateLevel: "hard",
    } as JarvisUsageSnapshot);

    expect(page.text("admin-jarvis-budget-line")).toContain(
      "$0.00 of $10.00 this window — soft gate at $0.00",
    );
    expect(page.text("admin-jarvis-gate-badge")).toBe("HARD GATE");
    expect(page.attribute("admin-jarvis-gate-badge", "data-gate")).toBe("hard");
  });
});
