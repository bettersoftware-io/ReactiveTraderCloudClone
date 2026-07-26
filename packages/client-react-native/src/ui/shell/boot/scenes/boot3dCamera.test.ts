import { expect, test } from "vitest";

import {
  bootCameraParams,
  gyroYawPitch,
  projectBootPoint,
} from "./boot3dCamera";

const UNCLAMPED = bootCameraParams({
  yaw: 0,
  pitch: 0,
  perspectiveK: 0.26,
  centerX: 200,
  centerY: 400,
  projScale: 100,
});

const CLAMPED = bootCameraParams({
  yaw: 0,
  pitch: 0,
  perspectiveK: 0.24,
  minPerspectiveDenom: 0.4,
  centerX: 200,
  centerY: 400,
  projScale: 100,
});

test("a point at the origin lands exactly on the camera centre", () => {
  const p = projectBootPoint(0, 0, 0, UNCLAMPED);

  expect(p.x).toBeCloseTo(200);
  expect(p.y).toBeCloseTo(400);
});

test("world units scale by projScale before the centre offset", () => {
  const p = projectBootPoint(1, 0, 0, UNCLAMPED);

  expect(p.x).toBeCloseTo(300);
});

test("depth shrinks a point toward the centre (perspective divide)", () => {
  const near = projectBootPoint(1, 0, -1, UNCLAMPED);
  const far = projectBootPoint(1, 0, 1, UNCLAMPED);

  expect(far.x - 200).toBeLessThan(near.x - 200);
});

// The correction that motivated this module: `hologram` and `geo` have NO
// near-plane clamp, so the wrapper must not default one on. An unclamped camera
// must keep diverging past the point a clamped one would pin.
test("an unclamped camera keeps growing where a clamped one saturates", () => {
  const deep = projectBootPoint(1, 0, -3.5, UNCLAMPED);
  const deeper = projectBootPoint(1, 0, -3.7, UNCLAMPED);

  expect(Math.abs(deeper.x - 200)).toBeGreaterThan(Math.abs(deep.x - 200));
});

test("a clamped camera pins the perspective divide at the near plane", () => {
  const deep = projectBootPoint(1, 0, -10, CLAMPED);

  expect(deep.perspective).toBeCloseTo(1 / 0.4);
});

test("clamping is opt-in — omitting minPerspectiveDenom leaves it undefined", () => {
  expect(UNCLAMPED.minPerspectiveDenom).toBeUndefined();
  expect(CLAMPED.minPerspectiveDenom).toBe(0.4);
});

test("each scene keeps its own perspectiveK", () => {
  expect(UNCLAMPED.perspectiveK).toBe(0.26);
  expect(CLAMPED.perspectiveK).toBe(0.24);
});

test("gyro drift maps into bounded yaw and pitch", () => {
  const centred = gyroYawPitch({ x: 0, y: 0 }, 0.5, 0.3);

  expect(centred.yaw).toBeCloseTo(0);
  expect(centred.pitch).toBeCloseTo(0);

  const extreme = gyroYawPitch({ x: 1, y: 1 }, 0.5, 0.3);

  expect(Math.abs(extreme.yaw)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(extreme.pitch)).toBeLessThanOrEqual(0.3);
});

test("gyro drift beyond unit range is clamped, not extrapolated", () => {
  const past = gyroYawPitch({ x: 9, y: -9 }, 0.5, 0.3);

  expect(past.yaw).toBeCloseTo(0.5);
  expect(past.pitch).toBeCloseTo(-0.3);
});

// An explicit 0 must survive the clamp. Resolving a default with `||` rather
// than `??` would silently turn a deliberate 0 into the fallback — the same
// class of defect as the worklet default-parameter trap in #334.
test("a zero drift axis stays zero rather than falling back", () => {
  const partial = gyroYawPitch({ x: 0, y: 1 }, 0.5, 0.3);

  expect(partial.yaw).toBe(0);
  expect(partial.pitch).toBeCloseTo(0.3);
});
