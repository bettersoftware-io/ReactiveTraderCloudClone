import { expect, test } from "vitest";

import { LASER_PANELS, panelRectPx, perimeterPoint } from "./laserGeometry.js";
import {
  type ContentShape,
  contentEase,
  contentScale,
  type FillRectContentShape,
  panelContentShapes,
} from "./laserPanelContent.js";

const RECT = { x: 0, y: 0, width: 200, height: 100 };

test("header panels lay out four chips, the first in the alt colour", () => {
  const shapes = panelContentShapes("header", RECT);
  expect(shapes).toHaveLength(4);
  expect(shapes[0].useAltColor).toBe(true);
  expect(shapes[1].useAltColor).toBe(false);
});

test("main panels lay out a 2x2 tile grid: outline, head band, sparkline each", () => {
  const shapes = panelContentShapes("main", RECT);
  expect(
    shapes.filter((s) => {
      return s.kind === "strokeRect";
    }),
  ).toHaveLength(4);
  expect(
    shapes.filter((s) => {
      return s.kind === "fillRect";
    }),
  ).toHaveLength(4);
  expect(
    shapes.filter((s) => {
      return s.kind === "polyline";
    }),
  ).toHaveLength(4);
});

test("list panels lay out four rows of decreasing width and alpha", () => {
  const shapes = panelContentShapes("list", RECT).filter(isFillRect);
  expect(shapes).toHaveLength(4);
  expect(shapes[0].width).toBeGreaterThan(shapes[3].width);
  expect(shapes[0].alpha).toBeGreaterThan(shapes[3].alpha);
});

test("blotter panels lay out a header band, 3 rules and 15 cells", () => {
  const shapes = panelContentShapes("blotter", RECT);
  expect(
    shapes.filter((s) => {
      return s.kind === "line";
    }),
  ).toHaveLength(3);
  expect(
    shapes.filter((s) => {
      return s.kind === "fillRect";
    }),
  ).toHaveLength(16);
});

test("status panels lay out nine pips, every third in the alt colour", () => {
  const shapes = panelContentShapes("status", RECT);
  expect(shapes).toHaveLength(9);
  expect(
    shapes.map((s) => {
      return s.useAltColor;
    }),
  ).toEqual([true, false, false, true, false, false, true, false, false]);
});

test("an unknown kind renders nothing rather than throwing", () => {
  expect(panelContentShapes("nope", RECT)).toEqual([]);
});

test("content eases in over the 0.24 window after the panel completes", () => {
  expect(contentEase(0.05, 0.1)).toBe(0);
  expect(contentEase(0.1, 0.1)).toBe(0);
  expect(contentEase(0.34, 0.1)).toBeCloseTo(1);
  expect(contentEase(0.9, 0.1)).toBeCloseTo(1);
});

test("content scales up from 0.32 to 1", () => {
  expect(contentScale(0)).toBeCloseTo(0.32);
  expect(contentScale(1)).toBeCloseTo(1);
});

test("the perimeter walk starts and ends at the top-left corner", () => {
  expect(perimeterPoint(RECT, 0)).toEqual({ x: 0, y: 0 });
  expect(perimeterPoint(RECT, 1)).toEqual({ x: 0, y: 0 });
});

test("the perimeter walk crosses each corner in top-right-bottom-left order", () => {
  // Perimeter 600: top 200, right 100, bottom 200, left 100.
  expect(perimeterPoint(RECT, 200 / 600)).toEqual({ x: 200, y: 0 });
  expect(perimeterPoint(RECT, 300 / 600)).toEqual({ x: 200, y: 100 });
  expect(perimeterPoint(RECT, 500 / 600)).toEqual({ x: 0, y: 100 });
});

test("every panel's content fits inside its own rect", () => {
  for (const panel of LASER_PANELS) {
    const rect = panelRectPx(panel, 390, 844);

    for (const shape of panelContentShapes(panel.kind, rect)) {
      if (shape.kind === "polyline") {
        continue;
      }

      expect(shape.x).toBeGreaterThanOrEqual(rect.x - 1);
      expect(shape.y).toBeGreaterThanOrEqual(rect.y - 1);
    }
  }
});

/** Narrows `ContentShape`'s union to the `fillRect` variant — needed because
 * `polyline` (the other variant `"list"` panels never emit) has no
 * `width`/`x`/`y`, so `ContentShape[]` alone doesn't let TS access `.width`
 * on an element without a runtime check first. */
function isFillRect(shape: ContentShape): shape is FillRectContentShape {
  return shape.kind === "fillRect";
}
