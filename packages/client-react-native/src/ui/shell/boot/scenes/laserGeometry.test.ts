import { expect, test } from "vitest";

import {
  LASER_PANELS,
  panelRevealFraction,
  rectTracePath,
} from "./laserGeometry.js";

// Table-driven, verbatim against `drawBootLaser`'s `panels` array
// (packages/client-react/src/ui/shell/boot/bootCanvas.ts:112-167) — a
// transcription slip in any single number here is exactly the failure mode
// this test exists to catch.
const EXPECTED_PANELS = [
  {
    nx: 0.055,
    ny: 0.045,
    nw: 0.89,
    nh: 0.075,
    t0: 0.0,
    t1: 0.1,
    kind: "header",
  },
  { nx: 0.055, ny: 0.155, nw: 0.56, nh: 0.5, t0: 0.09, t1: 0.32, kind: "main" },
  {
    nx: 0.635,
    ny: 0.155,
    nw: 0.31,
    nh: 0.235,
    t0: 0.3,
    t1: 0.45,
    kind: "list",
  },
  {
    nx: 0.635,
    ny: 0.415,
    nw: 0.31,
    nh: 0.24,
    t0: 0.43,
    t1: 0.57,
    kind: "list",
  },
  {
    nx: 0.055,
    ny: 0.685,
    nw: 0.89,
    nh: 0.17,
    t0: 0.55,
    t1: 0.68,
    kind: "blotter",
  },
  {
    nx: 0.055,
    ny: 0.875,
    nw: 0.89,
    nh: 0.05,
    t0: 0.66,
    t1: 0.74,
    kind: "status",
  },
];

test("LASER_PANELS has exactly six panels, ordered as the web source", () => {
  expect(LASER_PANELS).toHaveLength(6);
});

test.each(
  EXPECTED_PANELS.map((panel, index) => {
    return { index, panel };
  }),
)("panel $index ($panel.kind) matches the web source verbatim", ({
  index,
  panel,
}) => {
  expect(LASER_PANELS[index]).toEqual(panel);
});

test("panelRevealFraction is 0 before the trace window opens", () => {
  expect(panelRevealFraction(0, 0.3, 0.45)).toBe(0);
  expect(panelRevealFraction(0.29, 0.3, 0.45)).toBe(0);
});

test("panelRevealFraction ramps linearly across the trace window", () => {
  expect(panelRevealFraction(0.375, 0.3, 0.45)).toBeCloseTo(0.5);
});

test("panelRevealFraction holds at 1 once progress passes t1, never re-hiding", () => {
  expect(panelRevealFraction(0.45, 0.3, 0.45)).toBe(1);
  expect(panelRevealFraction(0.8, 0.3, 0.45)).toBe(1);
  expect(panelRevealFraction(1, 0.3, 0.45)).toBe(1);
});

test("panelRevealFraction never leaves [0,1] across a dense sweep of every panel's window", () => {
  for (const panel of LASER_PANELS) {
    for (let progress = 0; progress <= 1; progress += 0.01) {
      const fraction = panelRevealFraction(progress, panel.t0, panel.t1);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  }
});

test("rectTracePath emits a closed 4-segment rectangle outline, top-left origin, clockwise", () => {
  expect(rectTracePath(10, 20, 30, 40)).toBe("M10 20 L40 20 L40 60 L10 60 Z");
});
