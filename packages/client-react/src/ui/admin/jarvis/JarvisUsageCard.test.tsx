/**
 * Co-located unit test for the Jarvis Admin usage card. No shared ui-contract
 * spec exists yet for this surface (Task 10), and no neighboring admin card
 * (LatencyHistogram/ServiceHealth/LiveEventLog) has its own co-located test
 * either — but this component has enough real branch logic (null vs
 * populated, per-section empty lists, the windowEndMs=0 sentinel) to be
 * worth pinning directly rather than leaving to a future contract spec.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/client-core";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisUsageCard } from "./JarvisUsageCard";

afterEach(() => {
  cleanup();
});

describe("JarvisUsageCard", () => {
  it("shows NO USAGE DATA when useJarvisUsage() is null", () => {
    renderCard(null);

    expect(screen.getByTestId("admin-jarvis-usage-card").textContent).toContain(
      "NO USAGE DATA",
    );
  });

  it("renders per-brain rows for both windows, plus the reset time and caveat", () => {
    renderCard({
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

    const card = screen.getByTestId("admin-jarvis-usage-card");
    expect(card.textContent).toContain("Haiku 4.5");
    expect(card.textContent).toContain("Opus 5");
    expect(card.textContent).toContain("$0.12");
    expect(card.textContent).toContain("$1.20");
    expect(card.textContent).toContain("$4.50");
    expect(card.textContent).toContain("Window resets");
    expect(card.textContent).not.toContain("Window resets —");
    expect(card.textContent).toContain("resets on server restart");
  });

  it("prints — instead of a bogus epoch clock when windowEndMs is the 0 sentinel", () => {
    renderCard({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });

    const card = screen.getByTestId("admin-jarvis-usage-card");
    expect(card.textContent).toContain("Window resets —");
    expect(card.textContent).toContain("No turns yet");
  });
});

function renderCard(
  usage: JarvisUsageSnapshot | null,
): ReturnType<typeof render> {
  const hooks = {
    useJarvisUsage: () => {
      return usage;
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>
      <JarvisUsageCard />
    </ViewModelContext.Provider>,
  );
}
