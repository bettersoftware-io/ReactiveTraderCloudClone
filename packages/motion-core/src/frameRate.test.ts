import { describe, expect, it } from "vitest";

import {
  computeFps,
  FPS_GOOD,
  FPS_WARN,
  formatHeapMb,
  fpsTone,
} from "./frameRate.js";

describe("computeFps", () => {
  it("counts frames over the elapsed window as an integer fps", () => {
    expect(computeFps(60, 1000)).toBe(60);
    expect(computeFps(30, 500)).toBe(60);
    expect(computeFps(45, 1000)).toBe(45);
  });

  it("rounds to the nearest whole frame", () => {
    expect(computeFps(59, 1000)).toBe(59);
    expect(computeFps(1, 900)).toBe(1);
  });

  it("returns 0 for a non-positive window (guards divide-by-zero)", () => {
    expect(computeFps(10, 0)).toBe(0);
    expect(computeFps(10, -5)).toBe(0);
  });
});

describe("fpsTone", () => {
  it("is positive at/above the good threshold", () => {
    expect(fpsTone(FPS_GOOD)).toBe("positive");
    expect(fpsTone(60)).toBe("positive");
  });

  it("is aware between the warn and good thresholds", () => {
    expect(fpsTone(FPS_WARN)).toBe("aware");
    expect(fpsTone(FPS_GOOD - 1)).toBe("aware");
  });

  it("is negative below the warn threshold", () => {
    expect(fpsTone(FPS_WARN - 1)).toBe("negative");
    expect(fpsTone(0)).toBe("negative");
  });
});

describe("formatHeapMb", () => {
  it("formats used heap bytes as integer MB with a MB suffix", () => {
    expect(formatHeapMb(260 * 1024 * 1024)).toBe("260MB");
    expect(formatHeapMb(0)).toBe("0MB");
  });

  it("rounds to the nearest MB", () => {
    expect(formatHeapMb(1.6 * 1024 * 1024)).toBe("2MB");
  });
});
