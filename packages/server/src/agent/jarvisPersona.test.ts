import { describe, expect, it } from "vitest";

import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";

/**
 * Cheap drift guards, not prose tests — string containment + a length
 * band, not a grade of the writing. They exist to catch an edit that
 * silently drops a safety-load-bearing sentence (confirmation-before-
 * execution, no-fabrication) or lets the prompt balloon past the
 * "over-prescriptive prompts degrade output quality" budget.
 */
describe("JARVIS_SYSTEM_PROMPT", () => {
  it("addresses the user as sir", () => {
    expect(JARVIS_SYSTEM_PROMPT).toContain("sir");
  });

  it("mentions confirmation before any trade executes", () => {
    expect(JARVIS_SYSTEM_PROMPT.toLowerCase()).toContain("confirmation card");
    expect(JARVIS_SYSTEM_PROMPT.toLowerCase()).toContain("every trade");
  });

  it("mentions never fabricating desk data and always using tool calls", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("never fabricate");
    expect(lower).toContain("tool call");
  });

  it("mentions the tool-error-relay rule rather than inventing numbers", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("fails or times out");
  });

  it("mentions it has no standing sentinels yet", () => {
    expect(JARVIS_SYSTEM_PROMPT.toLowerCase()).toContain("no standing");
  });

  it("instructs terse 2-4 sentence replies", () => {
    expect(JARVIS_SYSTEM_PROMPT.toLowerCase()).toContain(
      "two to four sentences",
    );
  });

  it("instructs pair-precision price formatting", () => {
    expect(JARVIS_SYSTEM_PROMPT.toLowerCase()).toContain("precision");
  });

  it("names none of the trademarked film lines", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("iron man");
    expect(lower).not.toContain("stark industries");
  });

  it("stays within a focused length band (drift guard, not a style rule)", () => {
    expect(JARVIS_SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(200);
    expect(JARVIS_SYSTEM_PROMPT.length).toBeLessThanOrEqual(3_000);
  });
});
