import { describe, expect, it } from "vitest";

import { toSerializedDockview } from "#/dockSeed";

const FX_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

// A `row` split whose first child is itself a `row` split — exercises the
// same-direction flattening path (flattenSplit), distinct from FX_LIKE above
// (whose nested split alternates row/column and so never flattens).
const NESTED_SAME_DIR = {
  kind: "split",
  dir: "row",
  sizes: [0.5, 0.5],
  children: [
    {
      kind: "split",
      dir: "row",
      sizes: [0.4, 0.6],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "b" },
      ],
    },
    { kind: "panel", panelId: "c" },
  ],
} as const;

describe("toSerializedDockview", () => {
  it("maps a nested row/column tree to a branch/leaf grid with px sizes", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);

    expect(s.grid.orientation).toBe("HORIZONTAL");
    expect(s.grid.width).toBe(1000);
    expect(s.grid.height).toBe(800);

    const root = s.grid.root as SerializedNode;
    expect(root.type).toBe("branch");
    const [left, right] = root.data as SerializedNode[];
    expect(left.type).toBe("branch");
    expect(left.size).toBe(750);
    expect(right.type).toBe("leaf");
    expect(right.size).toBe(250);

    const [top, bottom] = left.data as SerializedNode[];
    expect(top.size).toBe(480); // 0.6 × 800 (column axis = height)
    expect(bottom.size).toBe(320);

    expect(Object.keys(s.panels).sort()).toEqual([
      "fx-analytics",
      "fx-blotter",
      "fx-rates",
    ]);
    expect(s.panels["fx-rates"].contentComponent).toBe("rtc-panel");
  });

  it("maps a single-panel tree to one leaf", () => {
    const s = toSerializedDockview(
      { kind: "panel", panelId: "admin-dashboard" },
      640,
      480,
    );
    expect(s.grid.root.type).toBe("leaf");
    expect(Object.keys(s.panels)).toEqual(["admin-dashboard"]);
  });

  it("gives every leaf a unique group id and an activeView", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);
    const leaves = collectLeaves(s.grid.root as SerializedNode);
    const ids = leaves.map((l) => {
      return (l.data as LeafGroupId).id;
    });
    expect(new Set(ids).size).toBe(leaves.length);

    for (const leaf of leaves) {
      const data = leaf.data as LeafGroupView;
      expect(data.views).toContain(data.activeView);
    }
  });

  it("flattens a same-direction nested split into one branch with scaled sizes", () => {
    const s = toSerializedDockview(NESTED_SAME_DIR, 1000, 800);

    // The nested row's two children (0.4 / 0.6 of ITS parent's 0.5 share)
    // splice directly into the root branch instead of nesting a redundant
    // single-axis branch: root.data has 3 leaves, not [branch, leaf].
    const root = s.grid.root as SerializedNode;
    expect(root.type).toBe("branch");
    const children = root.data as SerializedNode[];
    expect(
      children.map((child) => {
        return child.type;
      }),
    ).toEqual(["leaf", "leaf", "leaf"]);

    // Fractions: a = 0.4 × 0.5 = 0.2, b = 0.6 × 0.5 = 0.3, c = 0.5 (unscaled,
    // sibling of the flattened split, not one of its children). c is last so
    // it takes the exact remainder rather than a rounded fraction.
    const [aLeaf, bLeaf, cLeaf] = children;
    expect(aLeaf.size).toBe(200);
    expect(bLeaf.size).toBe(300);
    expect(cLeaf.size).toBe(500);
    expect((aLeaf.size ?? 0) + (bLeaf.size ?? 0) + (cLeaf.size ?? 0)).toBe(
      1000,
    );

    expect(Object.keys(s.panels).sort()).toEqual(["a", "b", "c"]);
  });
});

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
}

interface LeafGroupId {
  id: string;
}

interface LeafGroupView {
  views: string[];
  activeView: string;
}

function collectLeaves(node: SerializedNode): SerializedNode[] {
  if (node.type === "leaf") {
    return [node];
  }

  return (node.data as SerializedNode[]).flatMap((child) => {
    return collectLeaves(child);
  });
}
