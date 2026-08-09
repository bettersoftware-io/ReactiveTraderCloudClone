/**
 * Co-located unit test for the footer Jarvis status chip. No shared
 * ui-contract spec exists yet for this surface (Task 10) — this file covers
 * the two branches directly: hidden while unavailable, and the
 * effective-brain label/attribute while available.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisStatusChip } from "./JarvisStatusChip";

afterEach(() => {
  cleanup();
});

describe("JarvisStatusChip", () => {
  it("renders nothing while Jarvis is unavailable", () => {
    renderChip({ available: false, effectiveBrain: "scripted", gate: null });

    expect(screen.queryByTestId("jarvis-status-chip")).toBeNull();
  });

  it("shows the effective brain's label and data-brain while available", () => {
    renderChip({
      available: true,
      effectiveBrain: "claude-opus-5",
      gate: null,
    });

    const chip = screen.getByTestId("jarvis-status-chip");
    expect(chip.getAttribute("data-brain")).toBe("claude-opus-5");
    expect(chip.textContent).toBe("JARVIS · Opus 5");
  });

  it("labels the scripted brain as such", () => {
    renderChip({ available: true, effectiveBrain: "scripted", gate: null });

    expect(screen.getByTestId("jarvis-status-chip").textContent).toBe(
      "JARVIS · scripted",
    );
  });

  it("carries data-gate and a budget-limited suffix under a soft gate", () => {
    renderChip({
      available: true,
      effectiveBrain: "claude-haiku-4-5",
      gate: { level: "soft", resetsAtMs: 0, gated: ["claude-opus-5"] },
    });

    const chip = screen.getByTestId("jarvis-status-chip");
    expect(chip.getAttribute("data-gate")).toBe("soft");
    expect(chip.textContent).toBe("JARVIS · Haiku 4.5 · budget-limited");
  });

  it("carries data-gate and a budget-exhausted suffix under a hard gate", () => {
    renderChip({
      available: true,
      effectiveBrain: "scripted",
      gate: {
        level: "hard",
        resetsAtMs: 0,
        gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      },
    });

    const chip = screen.getByTestId("jarvis-status-chip");
    expect(chip.getAttribute("data-gate")).toBe("hard");
    expect(chip.textContent).toBe("JARVIS · scripted · budget exhausted");
  });
});

interface RenderChipState {
  available: boolean;
  effectiveBrain:
    | "scripted"
    | "claude-haiku-4-5"
    | "claude-sonnet-5"
    | "claude-opus-5";
  gate: {
    level: "soft" | "hard";
    resetsAtMs: number;
    gated: readonly string[];
  } | null;
}

function renderChip(state: RenderChipState): ReturnType<typeof render> {
  const hooks = {
    useJarvis: () => {
      return { state };
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>
      <JarvisStatusChip />
    </ViewModelContext.Provider>,
  );
}
