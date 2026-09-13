import { describe, expect, it } from "vitest";

import type { LayoutNode } from "#/layout/layoutPort";
import { visibleRootOf } from "#/layout/visibleRoot";

/** FX-like shape: main column (rates over blotter) beside a rail column
 * (analytics over positions) — the rail carries a design-width initialPx. */
const FX_LIKE_ROOT: LayoutNode = {
  kind: "split",
  dir: "row",
  sizes: [0.73, 0.27],
  initialPx: [undefined, 360],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.65, 0.35],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    {
      kind: "split",
      dir: "column",
      sizes: [0.55, 0.45],
      children: [
        { kind: "panel", panelId: "fx-analytics" },
        { kind: "panel", panelId: "fx-positions" },
      ],
    },
  ],
};

const THREE_STACK: LayoutNode = {
  kind: "split",
  dir: "column",
  sizes: [0.5, 0.3, 0.2],
  fixedPx: [undefined, 120, undefined],
  children: [
    { kind: "panel", panelId: "a" },
    { kind: "panel", panelId: "b" },
    { kind: "panel", panelId: "c" },
  ],
};

describe("visibleRootOf", () => {
  it("prunes a closed leaf of a 2-split and hoists the survivor into its slot", () => {
    const pruned = visibleRootOf(FX_LIKE_ROOT, ["fx-analytics"]);
    // rail column had [analytics, positions] — survivor hoists into the rail slot
    expect(leafIdsOf(pruned)).toEqual([
      "fx-rates",
      "fx-blotter",
      "fx-positions",
    ]);

    if (pruned.kind !== "split") {
      throw new Error("split expected");
    }

    expect(pruned.children[1]).toEqual({
      kind: "panel",
      panelId: "fx-positions",
    });
    // the outer row keeps its shape (sizes + initialPx untouched)
    expect(pruned.sizes).toEqual([0.73, 0.27]);
    expect(pruned.initialPx).toEqual([undefined, 360]);
  });

  it("prunes the middle child of a 3-split, renormalises sizes and slices px arrays", () => {
    const pruned = visibleRootOf(THREE_STACK, ["b"]);

    if (pruned.kind !== "split") {
      throw new Error("split expected");
    }

    expect(leafIdsOf(pruned)).toEqual(["a", "c"]);
    expect(sumSizesOf(pruned)).toBeCloseTo(1, 6);
    expect(pruned.sizes).toEqual([0.5 / 0.7, 0.2 / 0.7]);
    // the fixedPx slot of the pruned child is gone; survivors keep alignment
    expect(pruned.fixedPx).toEqual([undefined, undefined]);
  });

  it("collapses transitively: closing a whole column prunes it from the row", () => {
    const pruned = visibleRootOf(FX_LIKE_ROOT, [
      "fx-analytics",
      "fx-positions",
    ]);
    expect(pruned).toEqual({
      kind: "split",
      dir: "column",
      sizes: [0.65, 0.35],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    });
  });

  it("returns the SAME reference when closed is empty or matches nothing", () => {
    expect(visibleRootOf(FX_LIKE_ROOT, [])).toBe(FX_LIKE_ROOT);
    expect(visibleRootOf(FX_LIKE_ROOT, ["not-a-panel"])).toBe(FX_LIKE_ROOT);
    const sole: LayoutNode = { kind: "panel", panelId: "admin-dashboard" };
    expect(visibleRootOf(sole, ["bogus"])).toBe(sole);
  });
});

function leafIdsOf(node: LayoutNode): string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(leafIdsOf);
}

function sumSizesOf(node: LayoutNode): number {
  if (node.kind !== "split") {
    throw new Error("split expected");
  }

  return node.sizes.reduce((total, size) => {
    return total + size;
  }, 0);
}
