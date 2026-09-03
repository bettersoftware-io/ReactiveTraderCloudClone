import { expect, test } from "@jest/globals";

import { laserScenePage } from "#tests/pages/LaserScenePage";

import { CORNER_TICK_OPACITY, LASER_PANELS } from "./laserGeometry";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts, same as
// CoreScene.test.tsx), so pixels can never be asserted here — what's real is
// that the mocked `useDerivedValue` runs synchronously on every render and
// the mocked `<Path>` is a pass-through host element, so its resolved
// `start`/`end`/`path` props are queryable. The panel-table and reveal-math
// values themselves are covered directly (no mocks) in
// `laserGeometry.test.ts`.
//
// Every rerender is awaited — async under `@testing-library/react-native`
// (wraps in `act()`); firing the next one before the previous resolves
// corrupts the test renderer's tree ("overlapping act() calls").

test("mounts with the boot-scene-laser testID", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0 });
  expect(await page.exists()).toBe(true);
});

test("renders the background HUD grid", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0 });
  expect(await page.exists("boot-scene-laser-grid")).toBe(true);
});

test("renders one traced panel per entry in LASER_PANELS", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 2 });

  for (let index = 0; index < LASER_PANELS.length; index++) {
    expect(await page.exists(`boot-scene-laser-panel-${index}`)).toBe(true);
  }
});

test("renders one post-trace flash rect and one completion-tick path per panel", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 2 });

  for (let index = 0; index < LASER_PANELS.length; index++) {
    expect(await page.exists(`boot-scene-laser-panel-flash-${index}`)).toBe(
      true,
    );
    expect(await page.exists(`boot-scene-laser-panel-ticks-${index}`)).toBe(
      true,
    );
  }
});

test("a panel's path traces in (start=0, end<1) mid-window and holds fully drawn (end=1) after t1", async () => {
  // Panel 0 (header) traces across boot progress [0, 0.1]; with a 4.2s
  // (BOOT_DURATION_MS) boot, progress = elapsedSec / 4.2, so 0.2s elapsed
  // lands mid-window (progress ≈ 0.048).
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0.2 });
  expect(await page.startOf("boot-scene-laser-panel-0")).toBe(0);
  // `end` is a Reanimated SharedValue even under the official mock (a
  // {value, get} wrapper, not a plain number) — read via `endValueOf`.
  const midEnd = await page.endValueOf("boot-scene-laser-panel-0");
  expect(midEnd).toBeGreaterThan(0);
  expect(midEnd).toBeLessThan(1);
});

test("renders one per-kind content group per panel, for every panel kind", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 2 });

  for (let index = 0; index < LASER_PANELS.length; index++) {
    expect(await page.exists(`boot-scene-laser-panel-content-${index}`)).toBe(
      true,
    );
  }
});

test("renders the draw-head emitter beam and dot pair", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 2 });
  expect(await page.exists("boot-scene-laser-head")).toBe(true);
  expect(await page.exists("boot-scene-laser-head-glow")).toBe(true);
  expect(await page.exists("boot-scene-laser-head-core")).toBe(true);
});

test("the draw head is hidden before any panel starts tracing (elapsedSec = 0)", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0 });
  expect(await page.opacityValueOf("boot-scene-laser-head")).toBe(0);
});

test("the draw head is visible mid-trace and hidden again once every panel has completed (elapsedSec = 4.2)", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0.2 });
  expect(await page.opacityValueOf("boot-scene-laser-head")).toBe(1);

  await page.rerender({ elapsedSec: 4.2 });
  expect(await page.opacityValueOf("boot-scene-laser-head")).toBe(0);
});

test("survives elapsedSec sweeping across the whole boot timeline without throwing", async () => {
  const page = laserScenePage();
  await page.mount({ elapsedSec: 0 });

  // 0 .. well past BOOT_DURATION_MS (4200ms == 4.2s), covering every panel's
  // t0/t1 window on both sides.
  for (const t of [0, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.2, 5, 8]) {
    await page.rerender({ elapsedSec: t });
  }

  expect(await page.exists()).toBe(true);
  const lastPanelId = `boot-scene-laser-panel-${LASER_PANELS.length - 1}`;
  // Every panel's t1 is well under 1 (max is 0.74), so by well past the boot
  // duration every trace should be fully drawn and held there.
  expect(await page.endValueOf(lastPanelId)).toBe(1);

  // Long past every panel's t1 + 0.07 flash window, the flash has fully
  // faded but the completion corner ticks stay lit (they never re-hide).
  const lastFlashId = `boot-scene-laser-panel-flash-${LASER_PANELS.length - 1}`;
  const lastTicksId = `boot-scene-laser-panel-ticks-${LASER_PANELS.length - 1}`;
  expect(await page.opacityValueOf(lastFlashId)).toBe(0);
  expect(await page.opacityValueOf(lastTicksId)).toBe(CORNER_TICK_OPACITY);
});
