import { describe, expect, it } from "vitest";

import { toSerializedDockview } from "#/dockSeed";

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
}

function collectLeaves(node: SerializedNode): SerializedNode[] {
  if (node.type === "leaf") {
    return [node];
  }
  return (node.data as SerializedNode[]).flatMap((child) => {
    return collectLeaves(child);
  });
}

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
      return (l.data as { id: string }).id;
    });
    expect(new Set(ids).size).toBe(leaves.length);
    for (const leaf of leaves) {
      const data = leaf.data as { views: string[]; activeView: string };
      expect(data.views).toContain(data.activeView);
    }
  });
});
