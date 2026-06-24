// loadGolden reads the fixture via fileURLToPath(import.meta.url); under the
// client-react default jsdom env that URL is virtual and fileURLToPath/readFileSync
// fail, so this golden test runs in the node environment.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadGolden } from "#tests/ui/__golden__/loadGolden";

interface FlashCase {
  input: string;
  expected: {
    animationName: string;
    animationDuration?: string;
    animationTimingFunction?: string;
    animationIterationCount?: string;
    keyframeStops?: string[];
  };
}

// Read the ACTUAL CSS module text so this test fails if the animation shorthand
// or keyframes diverge from the original — verifying the CSS, not a PO constant.
const css = readFileSync(
  fileURLToPath(new URL("./BlotterRow.module.css", import.meta.url)),
  "utf8",
);

describe("new-row flash CSS matches rtc-original (golden)", () => {
  const golden = loadGolden<FlashCase>("row-highlight-animation");

  it("applies the original's animation shorthand on a highlighted row", () => {
    const c = golden.cases.find((x) => x.input === "new-row");
    if (!c) throw new Error("missing new-row golden case");
    const {
      animationName,
      animationDuration,
      animationTimingFunction,
      animationIterationCount,
    } = c.expected;
    const shorthand = `animation: ${animationName} ${animationDuration} ${animationTimingFunction} ${animationIterationCount}`;
    // Match the highlight rule block so we read the rule itself, not a comment.
    const highlightBlock =
      css.match(/\.row\[data-highlight="true"\]\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(
      highlightBlock,
      `[data-highlight="true"] rule present in CSS`,
    ).not.toBe("");
    expect(highlightBlock).toContain(shorthand);
  });

  it("defines @keyframes backgroundFlash with the golden colour stops in order", () => {
    const c = golden.cases.find((x) => x.input === "new-row");
    if (!c?.expected.keyframeStops) throw new Error("missing keyframeStops");
    const block = css.match(/@keyframes\s+backgroundFlash\s*\{[\s\S]*?\n\}/)?.[0];
    expect(block, "@keyframes backgroundFlash block present").toBeDefined();
    const stopVars = c.expected.keyframeStops.map((s) => `var(--${s})`);
    let from = 0;
    for (const v of stopVars) {
      const idx = (block as string).indexOf(v, from);
      expect(idx, `keyframe stop ${v} present in order`).toBeGreaterThanOrEqual(0);
      from = idx + v.length;
    }
  });

  it("applies no animation to a non-highlighted (base) row", () => {
    const c = golden.cases.find((x) => x.input === "existing-row");
    if (!c) throw new Error("missing existing-row golden case");
    expect(c.expected.animationName).toBe("none");
    const baseRule = css.match(/\.row\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(baseRule).not.toContain("animation");
  });
});
