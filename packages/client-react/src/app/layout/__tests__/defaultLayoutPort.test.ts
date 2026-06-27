import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort, PANEL_SPECS } from "../defaultLayoutPort";

function panelIds(node: import("../layoutPort").LayoutNode): string[] {
  return node.kind === "panel"
    ? [node.panelId]
    : node.children.flatMap(panelIds);
}

describe("createDefaultLayoutPort", () => {
  it("fx: rates + analytics fill the content row; blotter is the pinned bottom slot", () => {
    const { initial } = createDefaultLayoutPort("fx");
    expect(panelIds(initial.root)).toEqual([
      "fx-rates",
      "fx-analytics",
      "fx-blotter",
    ]);
    expect(PANEL_SPECS["fx-blotter"].pinned).toBe(true);
    expect(PANEL_SPECS["fx-rates"].pinned).toBeUndefined();
    // the content row is a 0.7/0.3 row split (rates wider than analytics)
    if (initial.root.kind !== "split") throw new Error("split root");
    const contentRow = initial.root.children[0];
    if (contentRow.kind !== "split") throw new Error("content row split");
    expect(contentRow.dir).toBe("row");
    expect(contentRow.sizes).toEqual([0.7, 0.3]);
    expect(initial.maximized).toBeNull();
    expect(initial.collapsed).toEqual([]);
  });

  it("credit: rfqs over a pinned blotter", () => {
    const { initial } = createDefaultLayoutPort("credit");
    expect(panelIds(initial.root)).toEqual(["credit-rfqs", "credit-blotter"]);
    expect(PANEL_SPECS["credit-blotter"].pinned).toBe(true);
  });

  it("admin: a single throughput panel, no pinned slot", () => {
    const { initial } = createDefaultLayoutPort("admin");
    expect(initial.root).toEqual({
      kind: "panel",
      panelId: "admin-throughput",
    });
  });

  it("every PANEL_SPECS entry has a human title matching its id key", () => {
    for (const [id, spec] of Object.entries(PANEL_SPECS)) {
      expect(spec.id).toBe(id);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });
});
