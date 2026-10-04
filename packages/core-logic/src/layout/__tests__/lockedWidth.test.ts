import { describe, expect, it } from "vitest";

import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-api";

import { lockedWidthPx } from "../lockedWidth";

describe("lockedWidthPx", () => {
  it("returns a lone locked panel's width", () => {
    expect(lockedWidthPx(createPanel("a"), SPECS)).toBe(360);
  });

  it("returns the shared width when every panel under a split is locked alike", () => {
    expect(lockedWidthPx(createColumn(["a", "b"]), SPECS)).toBe(360);
  });

  it("is undefined when any panel under the node is unlocked", () => {
    expect(lockedWidthPx(createColumn(["a", "free"]), SPECS)).toBeUndefined();
  });

  it("is undefined when two locked panels disagree on the width", () => {
    expect(lockedWidthPx(createColumn(["a", "narrow"]), SPECS)).toBeUndefined();
  });

  it("is undefined for an unknown panel id", () => {
    expect(lockedWidthPx(createPanel("ghost"), SPECS)).toBeUndefined();
  });
});

const SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  a: { id: "a", title: "A", fixedWidthPx: 360 },
  b: { id: "b", title: "B", fixedWidthPx: 360 },
  narrow: { id: "narrow", title: "N", fixedWidthPx: 290 },
  free: { id: "free", title: "F" },
};

function createPanel(panelId: string): LayoutNode {
  return { kind: "panel", panelId };
}

function createColumn(ids: readonly string[]): LayoutNode {
  return {
    kind: "split",
    dir: "column",
    sizes: ids.map(() => {
      return 1 / ids.length;
    }),
    children: ids.map(createPanel),
  };
}
