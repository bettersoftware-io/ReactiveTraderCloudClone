import { expect, test } from "vitest";

import { BOOT_TELEMETRY_BULLET } from "#/ui/shell/boot/scenes/bootGlyphs";

import {
  CALIBRATION_TICK_COUNT,
  calibrationTickLit,
  coreTelemetryLines,
} from "./coreTelemetry.js";

test("48 calibration ticks ring the globe", () => {
  expect(CALIBRATION_TICK_COUNT).toBe(48);
});

test("the lit arc grows with time and wraps every 48/14 seconds", () => {
  expect(calibrationTickLit(0, 0)).toBe(false);
  expect(calibrationTickLit(1, 0)).toBe(true);
  expect(calibrationTickLit(1, 40)).toBe(false);
  expect(calibrationTickLit(3, 40)).toBe(true);
  // (t*14) % 48 wraps at t = 48/14 ≈ 3.4286 s.
  expect(calibrationTickLit(3.43, 40)).toBe(false);
});

test("telemetry reports uplink as an integer percentage of boot progress", () => {
  expect(coreTelemetryLines(0, 0, 0).topLeftSecond).toBe(
    "NODES 10 · UPLINK 0%",
  );
  expect(coreTelemetryLines(0, 0.5, 0).topLeftSecond).toBe(
    "NODES 10 · UPLINK 50%",
  );
  expect(coreTelemetryLines(0, 1, 0).topLeftSecond).toBe(
    "NODES 10 · UPLINK 100%",
  );
});

test("telemetry prints yaw in degrees, wrapped to a single turn", () => {
  expect(coreTelemetryLines(0, 0, 0).topRightFirst).toBe("YAW 0.0°");
  expect(coreTelemetryLines(0, 0, 1).topRightFirst).toBe("YAW 57.3°");
});

test("the links line counts scheduled and live arcs", () => {
  const early = coreTelemetryLines(0.5, 0.1, 0).topRightSecond;
  expect(early).toBe("LINKS 0 · LIVE 0");
  const later = coreTelemetryLines(3, 0.7, 0).topRightSecond;
  expect(later).toMatch(/^LINKS \d+ · LIVE \d+$/);
});

test("the fixed banner text never changes", () => {
  expect(coreTelemetryLines(2, 0.4, 1).topLeftFirst).toBe(
    `${BOOT_TELEMETRY_BULLET} CORE SYNC · GLOBAL MESH`,
  );
});
