import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { HologramSceneHarness } from "./HologramSceneHarness";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts, same as
// CoreScene.test.tsx), so pixels can never be asserted here. What IS real: the
// mocked `useDerivedValue` runs the picture-building callback synchronously on
// every render, and the mocked `createPicture` invokes the real drawing
// helpers against a no-op canvas/paint. So these prove the scene wires up and
// its draw logic survives the whole boot timeline without throwing; the
// geometry itself is covered directly, unmocked, in `hologramGeometry.test.ts`.
//
// Every `rerender` is awaited — it wraps in `act()` under
// `@testing-library/react-native`, and firing the next before the previous
// resolves corrupts the renderer's tree ("overlapping act() calls").

test("mounts with the boot-scene-hologram testID and returns a picture", async () => {
  await render(<HologramSceneHarness elapsedSec={0} mx={0} my={0} />);
  const scene = await screen.findByTestId("boot-scene-hologram");

  expect(scene).toBeTruthy();
  expect(scene.props.picture).toBeTruthy();
});

test("survives elapsedSec sweeping across every status threshold", async () => {
  const { rerender } = await render(
    <HologramSceneHarness elapsedSec={0} mx={0} my={0} />,
  );

  // 0 .. past BOOT_DURATION_MS (4200ms), crossing the ground-grid start
  // (0.04), the gyro-ring fade-in (0.35), the three callout appearances
  // (0.55/0.65/0.75) and both status thresholds (0.5, 0.82) on both sides.
  for (const t of [0, 0.2, 0.9, 1.6, 2.4, 3.1, 3.6, 4.2, 7]) {
    await rerender(<HologramSceneHarness elapsedSec={t} mx={0} my={0} />);
  }

  expect(await screen.findByTestId("boot-scene-hologram")).toBeTruthy();
});

// The gyro seam reaches the camera, so a drift sweep exercises a genuinely
// different projection each frame rather than re-running one code path.
test("survives the full gyro drift range, including past the clamp", async () => {
  const { rerender } = await render(
    <HologramSceneHarness elapsedSec={2} mx={0} my={0} />,
  );

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-9, 9],
    [0.3, -0.4],
  ]) {
    await rerender(<HologramSceneHarness elapsedSec={2} mx={mx} my={my} />);
  }

  expect(await screen.findByTestId("boot-scene-hologram")).toBeTruthy();
});

// The columns' painter's-algorithm sort runs over all 81 entries every frame.
// A degenerate viewport is where an unguarded sort or divide would surface.
test("survives a mid-assembly frame, when both particles and columns draw", async () => {
  // progress ~0.28 puts most columns between scatter and settled, so the
  // particle branch AND the risen-column branch both execute.
  await render(<HologramSceneHarness elapsedSec={1.2} mx={0.5} my={-0.5} />);

  expect(await screen.findByTestId("boot-scene-hologram")).toBeTruthy();
});
