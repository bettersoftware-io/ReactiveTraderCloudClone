import { describe, expect, it } from "vitest";

import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-logic";
import { createDefaultLayoutPort, PANEL_SPECS } from "@rtc/core-logic";

import { maximizeBoundaryPath, nodeAtPath } from "../maximizeBoundary";

describe("maximizeBoundaryPath", () => {
  it("returns null (no maximize) for nothing maximized", () => {
    expect(maximizeBoundaryPath(fxRoot, null, PANEL_SPECS)).toBeNull();
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

  // A maximized id with no leaf in the tree — e.g. a Dockview-only chart
  // instance (`eq-chart:<symbol>`) the layout machine holds while the
  // in-house engine renders — must mean "no maximize", never a root-scope
  // one: the root boundary would strip every panel with nothing to restore.
  it("returns null (no maximize) for an id that is not in the tree, whatever its scope", () => {
    const specs: Readonly<Record<PanelId, PanelSpec>> = {
      ghost: { id: "ghost", title: "Ghost", maximizeScope: "nearest-column" },
    };
    expect(maximizeBoundaryPath(fxRoot, "ghost", specs)).toBeNull();
    expect(
      maximizeBoundaryPath(equitiesRoot, "eq-chart:AAPL", PANEL_SPECS),
    ).toBeNull();
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

const fxRoot: LayoutNode = createDefaultLayoutPort("fx").initial.root;

const equitiesRoot: LayoutNode =
  createDefaultLayoutPort("equities").initial.root;

const creditRoot: LayoutNode = createDefaultLayoutPort("credit").initial.root;
