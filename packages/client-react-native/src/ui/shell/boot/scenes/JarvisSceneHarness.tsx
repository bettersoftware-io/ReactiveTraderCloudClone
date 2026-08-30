// packages/client-react-native/src/ui/shell/boot/scenes/JarvisSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { JarvisScene } from "#/ui/shell/boot/scenes/JarvisScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `JarvisScene.test.tsx`, mirroring `CoreSceneHarness`
 * rather than `DockingSceneHarness`: `JarvisScene` DOES read gyro drift, so
 * `mx`/`my` are accepted as parameters and a test can sweep them.
 *
 * Lives in its own module for the same Biome reasons as the other harnesses
 * (`noExportsInTest` forbids exporting from a `*.test.tsx` file, and
 * `useComponentExportOnlyModules` forbids an unexported PascalCase
 * JSX-returning function living alongside a test).
 */
export function JarvisSceneHarness({
  elapsedSec,
  mx,
  my,
}: JarvisSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  const drift = useSharedValue({ mx, my });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <JarvisScene
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

interface JarvisSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}
