import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort, PANEL_SPECS } from "../defaultLayoutPort";
import type { LayoutNode, PanelId, PanelSpec } from "../layoutPort";
import { maximizeBoundaryPath, nodeAtPath } from "../maximizeBoundary";

const fxRoot: LayoutNode = createDefaultLayoutPort("fx").initial.root;
const equitiesRoot: LayoutNode =
  createDefaultLayoutPort("equities").initial.root;
const creditRoot: LayoutNode = createDefaultLayoutPort("credit").initial.root;

describe("maximizeBoundaryPath", () => {
  it("returns the root for nothing maximized", () => {
    expect(maximizeBoundaryPath(fxRoot, null, PANEL_SPECS)).toEqual([]);
  });

  it("returns the root for a root-scope panel (no maximizeScope on its spec)", () => {
    expect(maximizeBoundaryPath(fxRoot, "fx-rates", PANEL_SPECS)).toEqual([]);
    expect(
      maximizeBoundaryPath(creditRoot, "credit-rfqs", PANEL_SPECS),
    ).toEqual([]);
  });

  it("returns the nearest ancestor column split for the FX rail panels", () => {
    // the analytics/positions rail is child 1 of the root row split
    expect(maximizeBoundaryPath(fxRoot, "fx-analytics", PANEL_SPECS)).toEqual([
      1,
    ]);
    expect(maximizeBoundaryPath(fxRoot, "fx-positions", PANEL_SPECS)).toEqual([
      1,
    ]);
  });

  it("returns the ticket/watchlist rail for the equities rail panels", () => {
    expect(
      maximizeBoundaryPath(equitiesRoot, "eq-ticket", PANEL_SPECS),
    ).toEqual([1]);
    expect(
      maximizeBoundaryPath(equitiesRoot, "eq-watchlist", PANEL_SPECS),
    ).toEqual([1]);
  });

  it("picks the NEAREST (deepest) column ancestor when columns nest", () => {
    const nested: LayoutNode = {
      kind: "split",
      dir: "column",
      sizes: [0.5, 0.5],
      children: [
        { kind: "panel", panelId: "top" },
        {
          kind: "split",
          dir: "row",
          sizes: [0.5, 0.5],
          children: [
            { kind: "panel", panelId: "left" },
            {
              kind: "split",
              dir: "column",
              sizes: [0.5, 0.5],
              children: [
                { kind: "panel", panelId: "a" },
                { kind: "panel", panelId: "b" },
              ],
            },
          ],
        },
      ],
    };

    const specs: Readonly<Record<PanelId, PanelSpec>> = {
      a: { id: "a", title: "A", maximizeScope: "nearest-column" },
    };
    expect(maximizeBoundaryPath(nested, "a", specs)).toEqual([1, 1]);
  });

  it("falls back to the root when a nearest-column panel has no column ancestor", () => {
    const flatRow: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.5],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "b" },
      ],
    };

    const specs: Readonly<Record<PanelId, PanelSpec>> = {
      a: { id: "a", title: "A", maximizeScope: "nearest-column" },
    };
    expect(maximizeBoundaryPath(flatRow, "a", specs)).toEqual([]);
  });

  it("falls back to the root for an id that is not in the tree", () => {
    const specs: Readonly<Record<PanelId, PanelSpec>> = {
      ghost: { id: "ghost", title: "Ghost", maximizeScope: "nearest-column" },
    };
    expect(maximizeBoundaryPath(fxRoot, "ghost", specs)).toEqual([]);
  });
});

describe("nodeAtPath", () => {
  it("returns the root for the empty path and descends child indices", () => {
    expect(nodeAtPath(fxRoot, [])).toBe(fxRoot);
    expect(nodeAtPath(fxRoot, [1, 0])).toEqual({
      kind: "panel",
      panelId: "fx-analytics",
    });
  });

  it("returns null when the path walks off the tree", () => {
    expect(nodeAtPath(fxRoot, [1, 0, 0])).toBeNull();
    expect(nodeAtPath(fxRoot, [9])).toBeNull();
  });
});
