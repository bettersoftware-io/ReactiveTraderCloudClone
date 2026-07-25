import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { DockingSceneHarness } from "./DockingSceneHarness";

// Skia + Reanimated are fully mocked in this suite (jest.setup.ts, same as
// CoreScene.test.tsx/LaserScene.test.tsx), so pixels can never be asserted
// here — see that file's comment. What's real: the mocked `useDerivedValue`
// runs the picture-building callback synchronously on every render, and the
// mocked `createPicture` invokes the real drawing helpers against a no-op
// canvas/paint. So these tests prove the scene wires up correctly and its
// draw logic doesn't throw across the boot timeline; the geometry math
// itself is covered directly (no mocks) in `dockingGeometry.test.ts`.
//
// No drift-sweep test here (unlike `CoreScene.test.tsx`): `DockingScene`
// doesn't read gyro drift — same as `LaserScene`, whose test suite likewise
// has no drift coverage — so `DockingSceneHarness` fixes it at `{mx:0,my:0}`
// rather than accepting it as a test parameter with nothing to vary.
//
// Every `rerender` below is awaited — it's async under
// `@testing-library/react-native` (wraps in `act()`), and firing the next
// one before the previous resolves corrupts the test renderer's tree
// ("overlapping act() calls").

test("mounts with the boot-scene-docking testID and returns a picture", async () => {
  await render(<DockingSceneHarness elapsedSec={0} />);
  const scene = await screen.findByTestId("boot-scene-docking");
  expect(scene).toBeTruthy();
  expect(scene.props.picture).toBeTruthy();
});

test("survives elapsedSec sweeping across every status threshold without throwing", async () => {
  const { rerender } = await render(<DockingSceneHarness elapsedSec={0} />);

  // 0 .. well past BOOT_DURATION_MS (4200ms == 4.2s), crossing every
  // dockingStatus threshold (0.25, 0.55, 0.8, 0.92, 0.96 of boot progress) on
  // both sides — including the final-flash ramp past 0.92 and the "CLAMP
  // ENGAGED" state past 0.96, both added by Task 9's status banner, lock
  // reticle and final-flash draws.
  for (const t of [0, 0.4, 1.1, 2.3, 3.5, 4.2, 6]) {
    await rerender(<DockingSceneHarness elapsedSec={t} />);
  }

  expect(await screen.findByTestId("boot-scene-docking")).toBeTruthy();
});
