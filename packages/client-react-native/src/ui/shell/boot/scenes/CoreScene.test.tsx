import { expect, test } from "@jest/globals";

import { coreScenePage } from "#tests/pages/CoreScenePage";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts), so pixels
// can never be asserted here — see that file's comment. What's real: the
// mocked `useDerivedValue` runs the picture-building callback synchronously
// on every render, and the mocked `createPicture` invokes the real drawing
// helpers against a no-op canvas/paint. So these tests prove the scene wires
// up correctly and its draw logic doesn't throw across the boot timeline;
// the geometry math itself is covered directly (no mocks) in
// `coreGeometry.test.ts`.
//
// Every rerender below is awaited — it's async under
// `@testing-library/react-native` (wraps in `act()`), and firing the next
// one before the previous resolves corrupts the test renderer's tree
// ("overlapping act() calls").

test("mounts with the boot-scene-core testID and returns a picture", async () => {
  const page = coreScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });
  expect(await page.hasPicture()).toBe(true);
});

test("survives elapsedSec sweeping across the whole boot timeline without throwing", async () => {
  const page = coreScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  // 0 .. well past BOOT_DURATION_MS (4200ms == 4.2s), covering every reveal/
  // node/banner threshold (0.28, 0.32, 0.7) on both sides.
  for (const t of [0, 0.5, 1.3, 2.1, 3.2, 4.2, 5, 8]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});

test("survives gyro drift sweeping to its extremes without throwing", async () => {
  const page = coreScenePage();
  await page.mount({ elapsedSec: 2, mx: 0, my: 0 });

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [0, 0],
  ] as const) {
    await page.rerender({ elapsedSec: 2, mx, my });
  }

  expect(await page.exists()).toBe(true);
});

test("survives elapsedSec sweeping across the ring-reveal thresholds without throwing", async () => {
  // ringsPhase ramps from 18% to 43% of BOOT_DURATION_MS (4200ms): 0.756s and
  // 1.806s. 0.7/0.8 straddle the start of the ramp, 1.9 sits just past it.
  const page = coreScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  for (const t of [0.7, 0.8, 1.9]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});

test("survives elapsedSec sweeping across the order-flow arc gate without throwing", async () => {
  // ARC_FIRST_SEC = 0.36 * 4.2 = 1.512s: 1.6 is just past the gate (one arc
  // live), 2.4/3.1/4.2 sweep further in, each spawning more arcs and — once
  // nodesPhase reaches 1 — also exercising the spotlight callout. The arc
  // schedule's per-frame path building (trail + tail per live arc) is the
  // densest allocation this scene does; a mocked-Skia mount is the cheapest
  // jest-visible proof it doesn't throw.
  const page = coreScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  for (const t of [1.6, 2.4, 3.1, 4.2]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});

test("survives elapsedSec sweeping across the calibration-tick wrap point without throwing", async () => {
  // calibrationTickLit's `(elapsedSec * 14) % 48` wraps every ~3.4286s — the
  // one modulo edge case Task 4 (coreTelemetry.ts) adds. Straddling it here
  // is the jest-visible proof `drawCalibrationTicks`/`drawTelemetry` don't
  // throw right at the wrap.
  const page = coreScenePage();
  await page.mount({ elapsedSec: 3.4, mx: 0, my: 0 });

  for (const t of [3.4285, 3.4286, 3.4287, 3.43]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});

test("survives a dense elapsedSec sweep, including a holo-flicker glitch frame, without throwing", async () => {
  // Task 1's `holoFlickerAlpha` dips hard whenever a per-sixth-of-a-second
  // hash crosses 0.94 — rare enough that a coarse sweep can miss it. A dense
  // sweep (i/6 steps, matching the flicker's own sampling rate) is the only
  // jest-visible proof `drawBackdropWash`/`drawStars`/`drawNucleusGlow` (and
  // the now flicker-threaded existing helpers) don't throw on a glitch frame.
  const page = coreScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  for (let i = 0; i < 40; i++) {
    await page.rerender({ elapsedSec: i / 6, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});
