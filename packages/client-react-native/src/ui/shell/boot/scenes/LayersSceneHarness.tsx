// packages/client-react-native/src/ui/shell/boot/scenes/LayersSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { LayersScene } from "#/ui/shell/boot/scenes/LayersScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `LayersScene.test.tsx`, mirroring `CoreSceneHarness`
 * rather than `DockingSceneHarness`: `LayersScene` DOES read gyro drift, so
 * `mx`/`my` are accepted as parameters and a test can sweep them.
 *
 * Lives in its own module for the same Biome reasons as the other harnesses
 * (`noExportsInTest` forbids exporting from a `*.test.tsx` file, and
 * `useComponentExportOnlyModules` forbids an unexported PascalCase
 * JSX-returning function living alongside a test).
 */
export function LayersSceneHarness({
  elapsedSec,
  mx,
  my,
}: LayersSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  const drift = useSharedValue({ mx, my });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <LayersScene
        elapsedSec={elapsed}
        drift={drift}
        width={390}
        height={844}
        theme={rnThemeTokens.holo.dark}
      />
    </ThemeContext.Provider>
  );
}

interface LayersSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}
