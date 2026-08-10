import { describe, expect, it } from "vitest";

import { DESK_PANEL_ROSTER, PANEL_VIZ_KINDS } from "@rtc/shared";

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

  it("mentions render_panel and every panel viz kind (derived from the shared const array, not a hardcoded list)", () => {
    expect(JARVIS_SYSTEM_PROMPT).toContain("render_panel");

    for (const kind of PANEL_VIZ_KINDS) {
      expect(JARVIS_SYSTEM_PROMPT).toContain(kind);
    }
  });

  it("mentions targetPanelId — the edit-in-place affordance for restyling an already-rendered panel", () => {
    expect(JARVIS_SYSTEM_PROMPT).toContain("targetPanelId");
  });

  it("carries two panel few-shot examples: one authoring a new panel, one editing via targetPanelId", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("example — author");
    expect(lower).toContain("example — edit");
  });

  it("wraps both panel few-shot examples in the tool's real input envelope ({spec: …}), never the bare spec", () => {
    // The tool schema requires {spec, targetPanelId?} with additionalProperties
    // false — a bare-spec example would teach the model an input the tool
    // rejects, costing a self-correction round-trip on the flagship demo turn.
    const panelExampleLines = exampleLines().filter((line) => {
      return line.includes("render_panel");
    });

    expect(panelExampleLines).toHaveLength(2);

    for (const line of panelExampleLines) {
      expect(line).toMatch(/render_panel (?:again )?with \{spec: \{/);
    }

    const editLine = panelExampleLines.find((line) => {
      return line.startsWith("Example — edit");
    });

    expect(editLine).toContain("targetPanelId:");
  });

  it("mentions drive_app, the closed drive-command vocabulary, and the never-during-narration constraint", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("drive_app");
    expect(lower).toContain("switch tabs");
    expect(lower).toContain("[narration]");
  });

  it("carries three drive few-shot examples", () => {
    const driveExampleLines = exampleLines().filter((line) => {
      return line.includes("drive_app");
    });

    expect(driveExampleLines).toHaveLength(3);
  });

  it("wraps all three drive few-shot examples in the tool's real input envelope ({commands: [{kind: …}]}), never a bare/mismatched shape (the R1 envelope-drift lesson)", () => {
    const driveExampleLines = exampleLines().filter((line) => {
      return line.includes("drive_app");
    });

    expect(driveExampleLines).toHaveLength(3);

    for (const line of driveExampleLines) {
      expect(line).toMatch(/drive_app with \{commands: \[\{kind: /);
    }
  });

  it("accounts for EVERY Example line across BOTH tools' envelope pins — a third tool's example, or a malformed drive example missing the literal drive_app, must not silently escape both per-tool filters (the exact R1 drift mode these pins exist to catch)", () => {
    const allExampleLines = exampleLines();
    const panelExampleLines = allExampleLines.filter((line) => {
      return line.includes("render_panel");
    });

    const driveExampleLines = allExampleLines.filter((line) => {
      return line.includes("drive_app");
    });

    expect(allExampleLines).toHaveLength(5);
    expect(panelExampleLines.length + driveExampleLines.length).toBe(
      allExampleLines.length,
    );
  });

  it("names none of the trademarked film lines", () => {
    const lower = JARVIS_SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("iron man");
    expect(lower).not.toContain("stark industries");
  });

  it("stays within a focused length band (drift guard, not a style rule)", () => {
    expect(JARVIS_SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(200);
    expect(JARVIS_SYSTEM_PROMPT.length).toBeLessThanOrEqual(3_600);
  });

  it("derives the panel roster from DESK_PANEL_ROSTER (never a hand-typed list)", () => {
    for (const [tab, panels] of Object.entries(DESK_PANEL_ROSTER)) {
      for (const panel of panels) {
        expect(JARVIS_SYSTEM_PROMPT).toContain(panel.id);
      }

      expect(JARVIS_SYSTEM_PROMPT).toContain(`${tab}:`);
    }
  });

  it("carries the FX maximize worked example", () => {
    expect(JARVIS_SYSTEM_PROMPT).toContain(
      '{kind: "layout", op: "maximize", tab: "fx", panelId: "fx-rates"}',
    );
  });
});

/** Every `"Example — …"` line in the prompt, panel and drive alike — the
 * shared source both the panel-envelope and drive-envelope conformance
 * pins filter from. */
function exampleLines(): string[] {
  return JARVIS_SYSTEM_PROMPT.split("\n").filter((line) => {
    return line.startsWith("Example — ");
  });
}
