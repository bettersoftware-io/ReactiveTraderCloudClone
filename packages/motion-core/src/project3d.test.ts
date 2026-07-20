import { expect, test } from "vitest";

import { project3d } from "./project3d.js";

const FLAT = { yaw: 0, pitch: 0, perspectiveK: 0 };

test("with no rotation and no perspective, x and y pass through unchanged", () => {
  const p = project3d(0.5, 0.25, 0, FLAT);
  expect(p.x).toBeCloseTo(0.5);
  expect(p.y).toBeCloseTo(0.25);
  expect(p.perspective).toBeCloseTo(1);
});

test("a quarter-turn of yaw rotates +x onto +z", () => {
  const p = project3d(1, 0, 0, { ...FLAT, yaw: Math.PI / 2 });
  expect(p.x).toBeCloseTo(0);
  expect(p.z).toBeCloseTo(1);
});

test("positive depth foreshortens: perspective shrinks and scales x", () => {
  const near = project3d(1, 0, -1, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  const far = project3d(1, 0, 1, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  expect(far.perspective).toBeLessThan(near.perspective);
  expect(Math.abs(far.x)).toBeLessThan(Math.abs(near.x));
});

test("pitch tilts y toward the viewer and reports depth", () => {
  const p = project3d(0, 1, 0, { ...FLAT, pitch: Math.PI / 2 });
  expect(p.y).toBeCloseTo(0);
  expect(p.z).toBeCloseTo(1);
});

test("without a clamp, a large negative depth can invert the perspective sign", () => {
  const p = project3d(1, 0, -10, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  expect(p.perspective).toBeLessThan(0);
});

test("minPerspectiveDenom clamps the divisor so perspective stays positive", () => {
  const p = project3d(1, 0, -10, {
    yaw: 0,
    pitch: 0,
    perspectiveK: 0.28,
    minPerspectiveDenom: 0.4,
  });
  expect(p.perspective).toBeCloseTo(1 / 0.4);
});

test("is pure — repeated calls with the same inputs agree", () => {
  const params = { yaw: 0.6, pitch: 0.38, perspectiveK: 0.28 };
  expect(project3d(0.3, 0.4, 0.5, params)).toEqual(
    project3d(0.3, 0.4, 0.5, params),
  );
});
