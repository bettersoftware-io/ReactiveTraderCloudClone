import { afterEach, expect, test } from "@jest/globals";

import { jarvisScenePage } from "#tests/pages/JarvisScenePage";

const page = jarvisScenePage();

afterEach(() => {
  return page.unmountAll();
});

// Skia + Reanimated are fully mocked here (jest.setup.ts), so no pixel can be
// asserted. What IS real: the mocked `useDerivedValue` runs the
// picture-building callback synchronously, and the mocked `createPicture`
// invokes the real drawing helpers against a no-op canvas. These prove the
// scene wires up and survives the boot timeline; the geometry is covered
// unmocked in `jarvisGeometry.test.ts`.

test("mounts with the boot-scene-jarvis testID and returns a picture", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });
  expect(await page.hasPicture()).toBe(true);
});

test("survives elapsedSec sweeping across every threshold", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  // 0 .. past BOOT_DURATION_MS (4200ms), crossing the sphere grow (0-0.16),
  // all six ring reveals (0.05..0.30), the spokes (0.22), the fragment reveals
  // (0.34..0.76), the lunge window (0.45), cross-links (0.6) and both status
  // thresholds (0.32 / 0.75) on both sides.
  for (const t of [0, 0.3, 0.7, 1.1, 1.6, 2.1, 2.7, 3.3, 3.9, 4.2, 9]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});

test("survives the full gyro drift range, including past the clamp", async () => {
  await page.mount({ elapsedSec: 2.5, mx: 0, my: 0 });

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-9, 9],
    [0.3, -0.4],
  ]) {
    await page.rerender({ elapsedSec: 2.5, mx, my });
  }

  expect(await page.awaitExists()).toBe(true);
});

// Each of the five fragment kinds draws entirely different art, and one
// fragment lunges at a time on a 1.6s cycle. Walking a full cycle late in the
// boot is the only way to reach every kind AND the lunge branch.
test("survives a full lunge cycle with every fragment kind revealed", async () => {
  await page.mount({ elapsedSec: 3.2, mx: 0, my: 0 });

  for (let step = 0; step <= 20; step++) {
    await page.rerender({ elapsedSec: 3.2 + step * 0.09, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});

// The six ring layers each draw different machinery and enter on their own
// schedule, so a single frame reaches only the ones already revealed.
test("survives the whole ring sweep-in window", async () => {
  await page.mount({ elapsedSec: 0.1, mx: 0, my: 0 });

  for (let step = 0; step <= 16; step++) {
    await page.rerender({ elapsedSec: 0.1 + step * 0.12, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});
