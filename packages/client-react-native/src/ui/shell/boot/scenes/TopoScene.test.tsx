import { expect, test } from "@jest/globals";

import { topoScenePage } from "#tests/pages/TopoScenePage";

// Skia + Reanimated are fully mocked here (jest.setup.ts), so no pixel can be
// asserted. What IS real: the mocked `useDerivedValue` runs the
// picture-building callback synchronously, and the mocked `createPicture`
// invokes the real drawing helpers against a no-op canvas. These prove the
// scene wires up and survives the boot timeline; the geometry — including the
// heightfield and marching-squares contours — is covered unmocked in
// `topoGeometry.test.ts`.

test("mounts with the boot-scene-topo testID and returns a picture", async () => {
  const page = topoScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });
  expect(await page.hasPicture()).toBe(true);
});

test("survives elapsedSec sweeping across every threshold", async () => {
  const page = topoScenePage();
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  // 0 .. past BOOT_DURATION_MS (4200ms), crossing the terrain rise (0-0.4),
  // all eleven contour reveals (0.06 onward), the six beacon reveals
  // (0.44..0.715), the route (0.62) and both status thresholds (0.44 / 0.75).
  for (const t of [0, 0.2, 0.7, 1.3, 1.9, 2.4, 2.9, 3.4, 4.0, 4.2, 9]) {
    await page.rerender({ elapsedSec: t, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});

test("survives the full gyro drift range, including past the clamp", async () => {
  const page = topoScenePage();
  await page.mount({ elapsedSec: 2.5, mx: 0, my: 0 });

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-9, 9],
    [0.3, -0.4],
  ]) {
    await page.rerender({ elapsedSec: 2.5, mx, my });
  }

  expect(await page.exists()).toBe(true);
});

// Prices retick every 0.3s and each tick flashes for 0.22s, so walking the
// late boot frame by frame is the only way to reach both the flash-on and
// flash-decayed branches of every beacon.
test("survives a run of price ticks with all six beacons up", async () => {
  const page = topoScenePage();
  await page.mount({ elapsedSec: 3.1, mx: 0, my: 0 });

  for (let step = 0; step <= 24; step++) {
    await page.rerender({ elapsedSec: 3.1 + step * 0.07, mx: 0, my: 0 });
  }

  expect(await page.exists()).toBe(true);
});
