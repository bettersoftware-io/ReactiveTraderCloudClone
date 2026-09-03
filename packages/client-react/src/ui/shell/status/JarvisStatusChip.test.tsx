/**
 * Co-located unit test for the footer Jarvis status chip. No shared
 * ui-contract spec exists yet for this surface (Task 10) — this file covers
 * the two branches directly: hidden while unavailable, and the
 * effective-brain label/attribute while available.
 */
import { afterEach, describe, expect, it } from "vitest";

import { jarvisStatusChipPage } from "#tests/ui/pages/JarvisStatusChipPage";

const page = jarvisStatusChipPage();

afterEach(() => {
  page.unmountAll();
});

describe("JarvisStatusChip", () => {
  it("renders nothing while Jarvis is unavailable", () => {
    page.mount({ available: false, effectiveBrain: "scripted", gate: null });

    expect(page.exists()).toBe(false);
  });

  it("shows the effective brain's label and data-brain while available", () => {
    page.mount({
      available: true,
      effectiveBrain: "claude-opus-5",
      gate: null,
    });

    expect(page.attribute("data-brain")).toBe("claude-opus-5");
    expect(page.text()).toBe("JARVIS · Opus 5");
  });

  it("labels the scripted brain as such", () => {
    page.mount({ available: true, effectiveBrain: "scripted", gate: null });

    expect(page.text()).toBe("JARVIS · scripted");
  });

  it("carries data-gate and a budget-limited suffix under a soft gate", () => {
    page.mount({
      available: true,
      effectiveBrain: "claude-haiku-4-5",
      gate: { level: "soft", resetsAtMs: 0, gated: ["claude-opus-5"] },
    });

    expect(page.attribute("data-gate")).toBe("soft");
    expect(page.text()).toBe("JARVIS · Haiku 4.5 · budget-limited");
  });

  it("carries data-gate and a budget-exhausted suffix under a hard gate", () => {
    page.mount({
      available: true,
      effectiveBrain: "scripted",
      gate: {
        level: "hard",
        resetsAtMs: 0,
        gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      },
    });

    expect(page.attribute("data-gate")).toBe("hard");
    expect(page.text()).toBe("JARVIS · scripted · budget exhausted");
  });
});
