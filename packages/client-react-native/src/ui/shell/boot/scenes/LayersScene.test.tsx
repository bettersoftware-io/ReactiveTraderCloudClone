import { afterEach, expect, test } from "@jest/globals";

import { layersScenePage } from "#tests/pages/LayersScenePage";

const page = layersScenePage();

afterEach(() => {
  page.unmountAll();
});

// Skia + Reanimated are fully mocked here (jest.setup.ts), so no pixel can be
// asserted. What IS real: the mocked `useDerivedValue` runs the
// picture-building callback synchronously, and the mocked `createPicture`
// invokes the real drawing helpers against a no-op canvas. These prove the
// scene wires up and survives the boot timeline; the geometry is covered
// unmocked in `layersGeometry.test.ts`.
//
// Every rerender is awaited — it wraps in `act()`, and firing the next
// before the previous resolves corrupts the renderer's tree.

test("mounts with the boot-scene-layers testID and returns a picture", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });
  expect(await page.hasPicture()).toBe(true);
});

test("survives elapsedSec sweeping across every threshold", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  // 0 .. past BOOT_DURATION_MS (4200ms), crossing the draw-in stagger, the
  // explode start (0.14), the inspection window (0.38-0.92), the recomposite
  // ramp (0.93) and every status threshold on both sides.
  for (const t of [0, 0.1, 0.6, 1.5, 2.2, 3.0, 3.9, 4.2, 8]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});

// The stack is flat-on at both ends: spread is 0, so yaw and pitch are exactly
// 0 and every panel's world z collapses. That is the degenerate projection —
// worth exercising deliberately rather than only passing through it.
test("survives the flat-on frames at both ends of the boot", async () => {
  await page.mount({ elapsedSec: 0, mx: 1, my: 1 });
  await page.rerender({ elapsedSec: 4.2, mx: 1, my: 1 });

  expect(await page.awaitExists()).toBe(true);
});

test("survives the full gyro drift range, including past the clamp", async () => {
  await page.mount({ elapsedSec: 2, mx: 0, my: 0 });

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-9, 9],
    [0.3, -0.4],
  ]) {
    await page.rerender({ elapsedSec: 2, mx, my });
  }

  expect(await page.awaitExists()).toBe(true);
});

// Walks a full inspection cycle so every pullable layer is the selected one at
// least once — each kind draws different content, so this is the only test
// that reaches all five content branches plus the pulled overlay.
test("survives a full inspection cycle across all six pullable layers", async () => {
  await page.mount({ elapsedSec: 1.6, mx: 0, my: 0 });

  for (let step = 0; step <= 12; step++) {
    await page.rerender({ elapsedSec: 1.6 + step * 0.55, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});
