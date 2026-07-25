import { expect, test } from "vitest";

import {
  CORE_STARS,
  holoFlickerAlpha,
  starTwinkleAlpha,
} from "./coreBackdrop.js";

test("seeds 52 stars inside the normalized band the web variant uses", () => {
  expect(CORE_STARS).toHaveLength(52);

  for (const star of CORE_STARS) {
    expect(star.x).toBeGreaterThanOrEqual(0);
    expect(star.x).toBeLessThan(1);
    expect(star.y).toBeGreaterThanOrEqual(0);
    expect(star.y).toBeLessThanOrEqual(0.85);
    expect(star.size).toBeGreaterThanOrEqual(0.5);
    expect(star.size).toBeLessThanOrEqual(2);
    expect(star.phase).toBeGreaterThanOrEqual(0);
    expect(star.phase).toBeLessThanOrEqual(6.283);
  }
});

test("the star table is deterministic — no Math.random in the seeding", () => {
  // Pinned against an independent evaluation of the same sine-hash the web
  // variant uses (`hashRandom(i*7+1)` / `hashRandom(i*11+2)*0.85` / …  for
  // `i = 0`), not against itself — a self-comparison can never fail and
  // would silently pass even if `CORE_STARS` were reseeded with
  // `Math.random()` on every module load.
  const first = CORE_STARS[0];
  expect(first.x).toBeCloseTo(0.10468242550996365);
  expect(first.y).toBeCloseTo(0.6800910200734506);
  expect(first.size).toBeCloseTo(1.444553262062982);
  expect(first.phase).toBeCloseTo(4.891333272395482);
  expect(CORE_STARS[7].phase).not.toBe(CORE_STARS[8].phase);
});

test("star twinkle stays inside the web's 0.08..0.28 alpha band", () => {
  for (const t of [0, 0.3, 1.1, 2.7, 4.2, 9]) {
    for (const star of CORE_STARS) {
      const alpha = starTwinkleAlpha(t, star);
      expect(alpha).toBeGreaterThanOrEqual(0.08);
      expect(alpha).toBeLessThanOrEqual(0.28);
    }
  }
});

test("holo flicker hovers near 1 and never exceeds it", () => {
  for (const t of [0, 0.05, 0.4, 1.7, 3.3, 6]) {
    const alpha = holoFlickerAlpha(t);
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("holo flicker dips hard on a glitch frame", () => {
  const samples: number[] = [];

  for (let i = 0; i < 600; i++) {
    samples.push(holoFlickerAlpha(i / 60));
  }

  const dipped = samples.filter((a) => {
    return a < 0.6;
  });
  expect(dipped.length).toBeGreaterThan(0);
});

test("holo flicker is pure — the same second yields the same alpha", () => {
  expect(holoFlickerAlpha(2.5)).toBe(holoFlickerAlpha(2.5));
});
