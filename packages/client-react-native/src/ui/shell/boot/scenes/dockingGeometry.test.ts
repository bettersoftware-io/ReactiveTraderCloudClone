import { expect, test } from "vitest";

import {
  craftRadius,
  dockingShake,
  dockingStatus,
  dockingTarget,
  dockingTelemetry,
  dockingTimecode,
  lockBlink,
  lockBoxSize,
  lockPhase,
  padTwo,
  scanSweepY,
} from "./dockingGeometry.js";

test("camera shake decays as the boot eases in but never fully settles", () => {
  const early = dockingShake(0.3, 0);
  const late = dockingShake(0.3, 1);
  expect(Math.abs(early.x)).toBeGreaterThan(Math.abs(late.x));
  expect(Math.abs(late.x)).toBeGreaterThan(0);
});

test("shake amplitude is bounded by the web's coefficients", () => {
  for (let i = 0; i < 500; i++) {
    const shake = dockingShake(i / 50, 0);
    expect(Math.abs(shake.x)).toBeLessThanOrEqual(2.1 * 1.22);
    expect(Math.abs(shake.y)).toBeLessThanOrEqual(1.6 * 1.22);
  }
});

test("the craft grows from 12px to 104px across the boot", () => {
  expect(craftRadius(0)).toBeCloseTo(12);
  expect(craftRadius(1)).toBeCloseTo(104);
});

test("the target wobbles around centre early and settles on it late", () => {
  const early = dockingTarget(1.2, 0, 200, 400);
  const settled = dockingTarget(1.2, 1, 200, 400);
  expect(Math.hypot(settled.x - 200, settled.y - 400)).toBeLessThan(
    Math.hypot(early.x - 200, early.y - 400),
  );
});

test("the lock box closes in as the lock phase completes", () => {
  expect(lockBoxSize(0, 12, 400)).toBeGreaterThan(lockBoxSize(1, 12, 400));
  expect(lockBoxSize(1, 12, 400)).toBeCloseTo(12 * 1.45);
});

test("lock phase opens at 18% of progress and completes by 68%", () => {
  expect(lockPhase(0.1)).toBe(0);
  expect(lockPhase(0.68)).toBeCloseTo(1);
});

test("the reticle blinks only while acquiring", () => {
  expect(lockBlink(0.4, 0.1)).toBeLessThan(1);
  expect(lockBlink(0.4, 0.5)).toBe(1);
});

test("the status ladder walks the five docking states in order", () => {
  expect(dockingStatus(0).text).toBe("ACQUIRING");
  expect(dockingStatus(0.3).text).toBe("TRACKING");
  expect(dockingStatus(0.6).text).toBe("TARGET LOCKED");
  expect(dockingStatus(0.85).text).toBe("DOCKING SEQUENCE");
  expect(dockingStatus(0.99).text).toBe("CLAMP ENGAGED");
});

test("only the final state uses the positive colour role", () => {
  expect(dockingStatus(0.99).colorRole).toBe("positive");
  expect(dockingStatus(0.6).colorRole).toBe("alt");
  expect(dockingStatus(0.3).colorRole).toBe("primary");
});

test("padTwo zero-pads and takes the magnitude", () => {
  expect(padTwo(4)).toBe("04");
  expect(padTwo(-7.9)).toBe("07");
  expect(padTwo(123)).toBe("123");
});

test("the timecode is mm:ss:cc", () => {
  expect(dockingTimecode(0)).toBe("00:00:00");
  expect(dockingTimecode(65.5)).toBe("01:05:50");
});

test("range counts down to zero as the boot completes", () => {
  expect(dockingTelemetry(0, 0, 0, 0, 390, 844).range).toBe(4820);
  expect(dockingTelemetry(0, 1, 0, 0, 390, 844).range).toBe(0);
});

test("the scan sweep wraps down the viewport once every 1/0.35 s", () => {
  expect(scanSweepY(0, 800)).toBeCloseTo(0);
  expect(scanSweepY(1 / 0.7, 800)).toBeCloseTo(400);
});
