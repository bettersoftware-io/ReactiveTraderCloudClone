import { expect, test } from "vitest";

import {
  GYRO_RINGS,
  gyroPointVector,
  gyroRingSpin,
  gyroSegmentAngles,
  ringsPhase,
  scanRingAlpha,
  scanRingLatitude,
} from "./coreRings.js";

test("the scan ring sweeps south pole to north pole and wraps", () => {
  expect(scanRingLatitude(0)).toBeCloseTo(-Math.PI / 2);
  // 0.3 rev/s → half a sweep at t = 1/0.6 s.
  expect(scanRingLatitude(1 / 0.6)).toBeCloseTo(0);
  // Just before a full sweep it is near the north pole; just after, back south.
  expect(scanRingLatitude(3.32)).toBeGreaterThan(0);
  expect(scanRingLatitude(3.34)).toBeLessThan(0);
});

test("scan-ring alpha is brightest at the near edge and floors at 0.08", () => {
  expect(scanRingAlpha(-1)).toBeGreaterThan(scanRingAlpha(1));
  expect(scanRingAlpha(5)).toBeCloseTo(0.08);
  expect(scanRingAlpha(-5)).toBeCloseTo(0.46);
});

test("two rings counter-rotate at the web's radii and tilts", () => {
  expect(GYRO_RINGS).toHaveLength(2);
  expect(GYRO_RINGS[0].radius).toBeCloseTo(1.5);
  expect(GYRO_RINGS[1].radius).toBeCloseTo(1.66);
  expect(GYRO_RINGS[0].tilt).toBeCloseTo(1.05);
  expect(GYRO_RINGS[1].tilt).toBeCloseTo(-0.85);
  expect(Math.sign(GYRO_RINGS[0].spinRate)).not.toBe(
    Math.sign(GYRO_RINGS[1].spinRate),
  );
});

test("spin advances linearly with elapsed time", () => {
  expect(gyroRingSpin(0, GYRO_RINGS[0])).toBeCloseTo(0);
  expect(gyroRingSpin(2, GYRO_RINGS[0])).toBeCloseTo(1.2);
  expect(gyroRingSpin(2, GYRO_RINGS[1])).toBeCloseTo(-0.9);
});

test("segment 3 of every group of 4 is the gap — 6 drawn of 8", () => {
  const drawn = [0, 1, 2, 3, 4, 5, 6, 7].filter((seg) => {
    return gyroSegmentAngles(seg).length > 0;
  });
  expect(drawn).toEqual([0, 1, 2, 4, 5, 6]);
});

test("each drawn segment samples 11 angles inside one 8th-turn slot", () => {
  const angles = gyroSegmentAngles(1);
  expect(angles).toHaveLength(11);
  expect(angles[0]).toBeCloseTo((10 / 80) * 6.283);
  expect(angles[10]).toBeCloseTo((20 / 80) * 6.283);
});

test("a ring point lies at the ring radius before perspective is applied", () => {
  const spec = GYRO_RINGS[0];
  const [x, y, z] = gyroPointVector(0, spec, 0);
  expect(Math.hypot(x, y, z)).toBeCloseTo(spec.radius);
});

test("ring reveal starts at 18% of boot progress and completes by 43%", () => {
  expect(ringsPhase(0.1)).toBe(0);
  expect(ringsPhase(0.18)).toBeCloseTo(0);
  expect(ringsPhase(0.43)).toBeCloseTo(1);
  expect(ringsPhase(1)).toBeCloseTo(1);
});
