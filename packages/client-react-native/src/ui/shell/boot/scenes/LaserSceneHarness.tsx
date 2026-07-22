// packages/client-react-native/src/ui/shell/boot/scenes/LaserSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `LaserScene.test.tsx`, mirroring `CoreSceneHarness`:
 * wraps the scene in a fixed theme and turns `elapsedSec` into a fresh
 * shared value on every render, so a test can drive the scene across the
 * boot timeline purely by re-rendering with a new prop value. `LaserScene`
 * doesn't read gyro drift (the web laser variant has no cursor seam), but a
 * `drift` shared value is still supplied — `BootSceneProps` requires it.
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
  const drift = useSharedValue({ mx: 0, my: 0 });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <LaserScene
        elapsedSec={elapsed}
        drift={drift}
        width={390}
        height={844}
        theme={rnThemeTokens.holo.dark}
      />
    </ThemeContext.Provider>
  );
}

interface LaserSceneHarnessProps {
  elapsedSec: number;
}
