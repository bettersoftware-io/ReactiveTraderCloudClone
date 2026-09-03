import { afterEach, expect, test } from "@jest/globals";

import { geoScenePage } from "#tests/pages/GeoScenePage";

const page = geoScenePage();

afterEach(() => {
  return page.unmountAll();
});

// Skia + Reanimated are fully mocked here (jest.setup.ts), so no pixel can be
// asserted. What IS real: the mocked `useDerivedValue` runs the
// picture-building callback synchronously, and the mocked `createPicture`
// invokes the real drawing helpers against a no-op canvas. These prove the
// scene wires up and survives the boot timeline; the geometry is covered
// unmocked in `geoGeometry.test.ts` and `geoCoastlines.test.ts`.

test("mounts with the boot-scene-geo testID and returns a picture", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });
  expect(await page.hasPicture()).toBe(true);
});

test("survives elapsedSec sweeping across every threshold", async () => {
  await page.mount({ elapsedSec: 0, mx: 0, my: 0 });

  // 0 .. past BOOT_DURATION_MS (4200ms), crossing the coastline trace (0-0.3),
  // graticule (0.06), terrain rise (0.16), city bars (0.38), the trade window
  // (0.5) and every status threshold (0.3 / 0.55 / 0.85) on both sides.
  for (const t of [0, 0.2, 0.8, 1.4, 2.0, 2.6, 3.2, 3.8, 4.2, 9]) {
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

// The trade window is where the most branches run at once: arcs in flight,
// their landing ripples, city bars grown, and the hot-capital labels. Walking
// it frame by frame is the only way to reach the landing-ripple branch, which
// occupies just the last tenth of each flight.
test("survives the whole trade window, including arc landings", async () => {
  await page.mount({ elapsedSec: 2.1, mx: 0, my: 0 });

  for (let step = 0; step <= 30; step++) {
    await page.rerender({ elapsedSec: 2.1 + step * 0.11, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});

// The radar sweep is the one per-frame point-in-polygon caller, and it crosses
// sea as well as land — the sweep must handle starting and ending mid-landmass
// without emitting a stray segment.
test("survives the radar sweep crossing the map edge to edge", async () => {
  await page.mount({ elapsedSec: 1, mx: 0, my: 0 });

  for (let step = 0; step <= 16; step++) {
    await page.rerender({ elapsedSec: 1 + step * 0.19, mx: 0, my: 0 });
  }

  expect(await page.awaitExists()).toBe(true);
});
