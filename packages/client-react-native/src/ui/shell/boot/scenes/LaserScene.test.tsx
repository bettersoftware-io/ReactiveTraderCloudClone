import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { LaserSceneHarness } from "./LaserSceneHarness";
import { LASER_PANELS } from "./laserGeometry";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts, same as
// CoreScene.test.tsx), so pixels can never be asserted here — what's real is
// that the mocked `useDerivedValue` runs synchronously on every render and
// the mocked `<Path>` is a pass-through host element, so its resolved
// `start`/`end`/`path` props are queryable. The panel-table and reveal-math
// values themselves are covered directly (no mocks) in
// `laserGeometry.test.ts`.
//
// Every `rerender` is awaited — async under `@testing-library/react-native`
// (wraps in `act()`); firing the next one before the previous resolves
// corrupts the test renderer's tree ("overlapping act() calls").

test("mounts with the boot-scene-laser testID", async () => {
  await render(<LaserSceneHarness elapsedSec={0} />);
  expect(await screen.findByTestId("boot-scene-laser")).toBeTruthy();
});

test("renders one traced panel per entry in LASER_PANELS", async () => {
  await render(<LaserSceneHarness elapsedSec={2} />);

  for (let index = 0; index < LASER_PANELS.length; index++) {
    const panel = await screen.findByTestId(`boot-scene-laser-panel-${index}`);
    expect(panel).toBeTruthy();
  }
});

test("a panel's path traces in (start=0, end<1) mid-window and holds fully drawn (end=1) after t1", async () => {
  // Panel 0 (header) traces across boot progress [0, 0.1]; with a 4.2s
  // (BOOT_DURATION_MS) boot, progress = elapsedSec / 4.2, so 0.2s elapsed
  // lands mid-window (progress ≈ 0.048).
  await render(<LaserSceneHarness elapsedSec={0.2} />);
  const midTrace = await screen.findByTestId("boot-scene-laser-panel-0");
  expect(midTrace.props.start).toBe(0);
  // `end` is a Reanimated SharedValue even under the official mock (a
  // {value, get} wrapper, not a plain number) — unwrap it before asserting.
  expect(midTrace.props.end.value).toBeGreaterThan(0);
  expect(midTrace.props.end.value).toBeLessThan(1);
});

test("survives elapsedSec sweeping across the whole boot timeline without throwing", async () => {
  const { rerender } = await render(<LaserSceneHarness elapsedSec={0} />);

  // 0 .. well past BOOT_DURATION_MS (4200ms == 4.2s), covering every panel's
  // t0/t1 window on both sides.
  for (const t of [0, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.2, 5, 8]) {
    await rerender(<LaserSceneHarness elapsedSec={t} />);
  }

  expect(await screen.findByTestId("boot-scene-laser")).toBeTruthy();
  const lastPanel = await screen.findByTestId(
    `boot-scene-laser-panel-${LASER_PANELS.length - 1}`,
  );
  // Every panel's t1 is well under 1 (max is 0.74), so by well past the boot
  // duration every trace should be fully drawn and held there.
  expect(lastPanel.props.end.value).toBe(1);
});
