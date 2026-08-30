// packages/client-react-native/src/ui/shell/boot/scenes/LaserSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `LaserScene.test.tsx`, mirroring `CoreSceneHarness`:
 * wraps the scene in a fixed theme and drives `elapsedSec` through a shared
 * value, so a test can walk the scene across the boot timeline purely by
 * re-rendering with a new prop value. `LaserScene` doesn't read gyro drift
 * (the web laser variant has no cursor seam), but a `drift` shared value is
 * still supplied — `BootSceneProps` requires it.
 *
 * THE WRITE-THROUGH IS LOAD-BEARING (T31). This used to rely on
 * `useSharedValue` returning a *fresh object carrying the new prop* on every
 * render — true of the old jest mock, and false of the real hook, which is
 * `useRef`-backed and captures its argument once. So the harness only
 * propagated `elapsedSec` because the mock was wrong, and the two timeline
 * tests would have gone on passing against a component frozen at its first
 * frame — T29's exact defect, reproduced in the instrument meant to catch it.
 * Assigning `.value` is how a real shared value is driven from a changing
 * prop, so this now models the hook instead of the mock.
 *
 * Lives in its own module for the same Biome reasons as `CoreSceneHarness`
 * (`noExportsInTest` forbids exporting from a `*.test.tsx` file, and
 * `useComponentExportOnlyModules` forbids an unexported PascalCase
 * JSX-returning function living alongside a test).
 */
export function LaserSceneHarness({
  elapsedSec,
}: LaserSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  elapsed.value = elapsedSec;
  const drift = useSharedValue({ mx: 0, my: 0 });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <LaserScene
        elapsedSec={elapsed}
        drift={drift}
        width={390}
        height={844}
        topInset={0}
        theme={rnThemeTokens.holo.dark}
      />
    </ThemeContext.Provider>
  );
}

interface LaserSceneHarnessProps {
  elapsedSec: number;
}
