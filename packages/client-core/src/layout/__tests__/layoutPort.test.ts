import { describe, expect, it } from "vitest";

import type { LayoutNode, LayoutPort, LayoutState } from "../layoutPort";

describe("LayoutPort types", () => {
  it("describes a split tree with panel leaves, sizes, and maximize/collapse fields", () => {
    const root: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.7, 0.3],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-analytics" },
      ],
    };
    const state: LayoutState = { root, maximized: null, collapsed: [] };
    const port: LayoutPort = { initial: state };

    expect(port.initial.root.kind).toBe("split");

    // narrow the union so the test exercises the discriminant the engine reads
    if (port.initial.root.kind !== "split") {
      throw new Error("expected split root");
    }

    expect(port.initial.root.dir).toBe("row");
    expect(port.initial.root.sizes).toEqual([0.7, 0.3]);
    expect(port.initial.root.children).toHaveLength(2);
    expect(port.initial.maximized).toBeNull();
    expect(port.initial.collapsed).toEqual([]);
  });
});
