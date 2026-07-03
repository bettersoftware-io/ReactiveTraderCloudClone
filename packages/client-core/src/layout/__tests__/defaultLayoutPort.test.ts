import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort, PANEL_SPECS } from "../defaultLayoutPort";

describe("createDefaultLayoutPort", () => {
  it("fx: rates + a fixed rail (analytics over positions) fill the content row; blotter is the pinned bottom slot", () => {
    const { initial } = createDefaultLayoutPort("fx");
    expect(panelIds(initial.root)).toEqual([
      "fx-rates",
      "fx-analytics",
      "fx-positions",
      "fx-blotter",
    ]);
    expect(PANEL_SPECS["fx-blotter"].pinned).toBe(true);
    expect(PANEL_SPECS["fx-rates"].pinned).toBeUndefined();
    expect(PANEL_SPECS["fx-positions"]).toEqual({
      id: "fx-positions",
      title: "Positions",
    });
    // the content row is a 0.7/0.3 row split (rates wider than the fixed rail)
    if (initial.root.kind !== "split") throw new Error("split root");
    const contentRow = initial.root.children[0];
    if (contentRow.kind !== "split") throw new Error("content row split");
    expect(contentRow.dir).toBe("row");
    expect(contentRow.sizes).toEqual([0.7, 0.3]);
    expect(initial.maximized).toBeNull();
    expect(initial.collapsed).toEqual([]);
  });

  it("FX root has a fixed 360px right rail stacking analytics over positions", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const root = initial.root;
    if (root.kind !== "split") throw new Error("fx root must be a split");
    const topRow = root.children[0];
    if (topRow.kind !== "split") throw new Error("fx top row must be a split");
    expect(topRow.fixedPx).toEqual([undefined, 360]);
    const rail = topRow.children[1];
    if (rail.kind !== "split") throw new Error("rail must be a split");
    expect(rail.children).toEqual([
      { kind: "panel", panelId: "fx-analytics" },
      { kind: "panel", panelId: "fx-positions" },
    ]);
  });

  it("credit: rfqs over a pinned blotter", () => {
    const { initial } = createDefaultLayoutPort("credit");
    expect(panelIds(initial.root)).toEqual(["credit-rfqs", "credit-blotter"]);
    expect(PANEL_SPECS["credit-blotter"].pinned).toBe(true);
  });

  it("admin: a single dashboard panel, no pinned slot", () => {
    const { initial } = createDefaultLayoutPort("admin");
    expect(initial.root).toEqual({
      kind: "panel",
      panelId: "admin-dashboard",
    });
  });

  it("every PANEL_SPECS entry has a human title matching its id key", () => {
    for (const [id, spec] of Object.entries(PANEL_SPECS)) {
      expect(spec.id).toBe(id);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });
});

function panelIds(node: import("../layoutPort").LayoutNode): string[] {
  return node.kind === "panel"
    ? [node.panelId]
    : node.children.flatMap(panelIds);
}
