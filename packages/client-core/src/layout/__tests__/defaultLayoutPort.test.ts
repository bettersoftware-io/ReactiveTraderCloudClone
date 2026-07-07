import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "../defaultLayoutPort";
import { createDefaultLayoutPort, PANEL_SPECS } from "../defaultLayoutPort";
import type { LayoutNode, PanelId, PanelSpec } from "../layoutPort";

describe("createDefaultLayoutPort", () => {
  it("fx: rates + a resizable right column (analytics over positions) fill the content row; blotter is a resizable bottom split", () => {
    const { initial } = createDefaultLayoutPort("fx");
    expect(panelIds(initial.root)).toEqual([
      "fx-rates",
      "fx-analytics",
      "fx-positions",
      "fx-blotter",
    ]);
    expect(PANEL_SPECS["fx-blotter"].pinned).toBeUndefined();
    expect(PANEL_SPECS["fx-rates"].pinned).toBeUndefined();
    expect(PANEL_SPECS["fx-positions"]).toEqual({
      id: "fx-positions",
      title: "Positions",
    });
    // the content row is a 0.74/0.26 row split (rates wider than the column)
    if (initial.root.kind !== "split") throw new Error("split root");
    const contentRow = initial.root.children[0];
    if (contentRow.kind !== "split") throw new Error("content row split");
    expect(contentRow.dir).toBe("row");
    expect(contentRow.sizes).toEqual([0.74, 0.26]);
    expect(initial.maximized).toBeNull();
    expect(initial.collapsed).toEqual([]);
  });

  it("FX root has no fixedPx anywhere — every split is ratio-sized and draggable", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const root = initial.root;
    if (root.kind !== "split") throw new Error("fx root must be a split");
    expect(root.sizes).toEqual([0.78, 0.22]);
    expect(root.fixedPx).toBeUndefined();
    const topRow = root.children[0];
    if (topRow.kind !== "split") throw new Error("fx top row must be a split");
    expect(topRow.fixedPx).toBeUndefined();
    const rightColumn = topRow.children[1];

    if (rightColumn.kind !== "split") {
      throw new Error("right column must be a split");
    }

    expect(rightColumn.fixedPx).toBeUndefined();
    expect(rightColumn.children).toEqual([
      { kind: "panel", panelId: "fx-analytics" },
      { kind: "panel", panelId: "fx-positions" },
    ]);
  });

  it("credit: a New RFQ rail beside a resizable RFQs-over-blotter column", () => {
    const { initial } = createDefaultLayoutPort("credit");
    expect(panelIds(initial.root)).toEqual([
      "credit-new-rfq",
      "credit-rfqs",
      "credit-blotter",
    ]);
    expect(PANEL_SPECS["credit-blotter"].pinned).toBeUndefined();
    expect(PANEL_SPECS["credit-new-rfq"]).toEqual({
      id: "credit-new-rfq",
      title: "New RFQ",
    });
    expect(PANEL_SPECS["credit-rfqs"]).toEqual({
      id: "credit-rfqs",
      title: "RFQs",
    });
    // credit-sell-side is registered (Sell Side) but not part of the default
    // credit tree — it has no dock slot yet, unlike every other spec entry.
    expect(PANEL_SPECS["credit-sell-side"]).toEqual({
      id: "credit-sell-side",
      title: "Sell Side",
    });

    // root: a row split — [New RFQ rail | RFQs-over-blotter column].
    const root = initial.root;
    if (root.kind !== "split") throw new Error("credit root must be a split");
    expect(root.dir).toBe("row");
    expect(root.sizes).toEqual([0.25, 0.75]);
    expect(root.children[0]).toEqual({
      kind: "panel",
      panelId: "credit-new-rfq",
    });

    const column = root.children[1];

    if (column.kind !== "split") {
      throw new Error("credit RFQs/blotter column must be a split");
    }

    expect(column.dir).toBe("column");
    expect(column.sizes).toEqual([0.62, 0.38]);
    expect(column.children).toEqual([
      { kind: "panel", panelId: "credit-rfqs" },
      { kind: "panel", panelId: "credit-blotter" },
    ]);
  });

  it("admin: a single dashboard panel, no pinned slot", () => {
    const { initial } = createDefaultLayoutPort("admin");
    expect(initial.root).toEqual({
      kind: "panel",
      panelId: "admin-dashboard",
    });
  });

  it("equities: a four-panel dock — chart+blotter column beside ticket+watchlist column", () => {
    const { initial } = createDefaultLayoutPort("equities");
    expect(panelIds(initial.root)).toEqual([
      "eq-chart",
      "eq-blotter",
      "eq-ticket",
      "eq-watchlist",
    ]);

    if (initial.root.kind !== "split") {
      throw new Error("equities root must be a split");
    }

    expect(initial.root.dir).toBe("row");
    expect(initial.root.sizes).toEqual([0.78, 0.22]);

    const leftColumn = initial.root.children[0];

    if (leftColumn.kind !== "split") {
      throw new Error("left column must be a split");
    }

    expect(leftColumn.dir).toBe("column");
    expect(leftColumn.sizes).toEqual([0.66, 0.34]);
    expect(leftColumn.children).toEqual([
      { kind: "panel", panelId: "eq-chart" },
      { kind: "panel", panelId: "eq-blotter" },
    ]);

    const rightColumn = initial.root.children[1];

    if (rightColumn.kind !== "split") {
      throw new Error("right column must be a split");
    }

    expect(rightColumn.dir).toBe("column");
    expect(rightColumn.sizes).toEqual([0.5, 0.5]);
    expect(rightColumn.children).toEqual([
      { kind: "panel", panelId: "eq-ticket" },
      { kind: "panel", panelId: "eq-watchlist" },
    ]);
  });

  it("PANEL_SPECS registers eq-depth and eq-sectors, but neither appears in the equities default tree (mounted directly, not docked)", () => {
    const { initial } = createDefaultLayoutPort("equities");
    expect(PANEL_SPECS["eq-depth"]).toEqual({ id: "eq-depth", title: "Depth" });
    expect(PANEL_SPECS["eq-sectors"]).toEqual({
      id: "eq-sectors",
      title: "Sectors",
    });
    expect(panelIds(initial.root)).not.toContain("eq-depth");
    expect(panelIds(initial.root)).not.toContain("eq-sectors");
  });

  it("the old single flat equities panel spec is retired", () => {
    expect(PANEL_SPECS.equities).toBeUndefined();
  });

  it("every PANEL_SPECS entry has a human title matching its id key", () => {
    for (const [id, spec] of Object.entries(PANEL_SPECS)) {
      expect(spec.id).toBe(id);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });

  it("no PANEL_SPECS entry is pinned — every split is user-resizable (the pinned flag machinery stays for future use)", () => {
    for (const spec of Object.values(PANEL_SPECS)) {
      expect(spec.pinned).toBeUndefined();
    }
  });

  it.each<WorkspaceTab>([
    "fx",
    "credit",
    "admin",
    "equities",
  ])("every adjacent pair in every split of the %s tab's default tree yields a resize handle", (tab) => {
    const { initial } = createDefaultLayoutPort(tab);
    const flags = collectHandleFlags(initial.root, PANEL_SPECS);
    expect(flags.length > 0 || isSinglePanel(initial.root)).toBe(true);
    expect(flags.every(Boolean)).toBe(true);
  });
});

function panelIds(node: LayoutNode): string[] {
  return node.kind === "panel"
    ? [node.panelId]
    : node.children.flatMap(panelIds);
}

function isSinglePanel(node: LayoutNode): boolean {
  return node.kind === "panel";
}

/** Tree-walk helper mirroring InhouseLayoutEngine's `showHandle` derivation
 * (packages/client-react/.../InhouseLayoutEngine.tsx): for every adjacent pair
 * of children in every split node, `true` means the engine would render a
 * drag handle between them. Walking the whole tree (not just the root split)
 * proves resizability holds at every nesting depth, not only the top level. */
function collectHandleFlags(
  node: LayoutNode,
  specs: Readonly<Record<PanelId, PanelSpec>>,
): boolean[] {
  if (node.kind !== "split") return [];

  const flags: boolean[] = [];

  for (let i = 0; i < node.children.length - 1; i++) {
    const child = node.children[i];
    const nextChild = node.children[i + 1];
    const childPinned =
      child.kind === "panel" && specs[child.panelId]?.pinned === true;
    const nextChildPinned =
      nextChild.kind === "panel" && specs[nextChild.panelId]?.pinned === true;
    const childFixed = node.fixedPx?.[i];
    const nextFixed = node.fixedPx?.[i + 1];
    const showHandle =
      !childPinned &&
      !nextChildPinned &&
      childFixed === undefined &&
      nextFixed === undefined;
    flags.push(showHandle);
  }

  for (const child of node.children) {
    flags.push(...collectHandleFlags(child, specs));
  }

  return flags;
}
