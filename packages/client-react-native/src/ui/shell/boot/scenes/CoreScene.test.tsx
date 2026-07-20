import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { CoreSceneHarness } from "./CoreSceneHarness";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts), so pixels
// can never be asserted here — see that file's comment. What's real: the
// mocked `useDerivedValue` runs the picture-building callback synchronously
// on every render, and the mocked `createPicture` invokes the real drawing
// helpers against a no-op canvas/paint. So these tests prove the scene wires
// up correctly and its draw logic doesn't throw across the boot timeline;
// the geometry math itself is covered directly (no mocks) in
// `coreGeometry.test.ts`.
//
// Every `rerender` below is awaited — it's async under
// `@testing-library/react-native` (wraps in `act()`), and firing the next
// one before the previous resolves corrupts the test renderer's tree
// ("overlapping act() calls").

test("mounts with the boot-scene-core testID and returns a picture", async () => {
  await render(<CoreSceneHarness elapsedSec={0} mx={0} my={0} />);
  const scene = await screen.findByTestId("boot-scene-core");
  expect(scene).toBeTruthy();
  expect(scene.props.picture).toBeTruthy();
});

test("survives elapsedSec sweeping across the whole boot timeline without throwing", async () => {
  const { rerender } = await render(
    <CoreSceneHarness elapsedSec={0} mx={0} my={0} />,
  );

  // 0 .. well past BOOT_DURATION_MS (4200ms == 4.2s), covering every reveal/
  // node/banner threshold (0.28, 0.32, 0.7) on both sides.
  for (const t of [0, 0.5, 1.3, 2.1, 3.2, 4.2, 5, 8]) {
    await rerender(<CoreSceneHarness elapsedSec={t} mx={0} my={0} />);
  }

  expect(await screen.findByTestId("boot-scene-core")).toBeTruthy();
});

test("survives gyro drift sweeping to its extremes without throwing", async () => {
  const { rerender } = await render(
    <CoreSceneHarness elapsedSec={2} mx={0} my={0} />,
  );

  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [0, 0],
  ] as const) {
    await rerender(<CoreSceneHarness elapsedSec={2} mx={mx} my={my} />);
  }

  expect(await screen.findByTestId("boot-scene-core")).toBeTruthy();
});
