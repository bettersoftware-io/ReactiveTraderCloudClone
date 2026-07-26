// packages/client-react-native/src/ui/shell/boot/scenes/TopoSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { TopoScene } from "#/ui/shell/boot/scenes/TopoScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `TopoScene.test.tsx`, mirroring `CoreSceneHarness`
 * rather than `DockingSceneHarness`: `TopoScene` DOES read gyro drift, so
 * `mx`/`my` are accepted as parameters and a test can sweep them.
 *
 * Lives in its own module for the same Biome reasons as the other harnesses
 * (`noExportsInTest` forbids exporting from a `*.test.tsx` file, and
 * `useComponentExportOnlyModules` forbids an unexported PascalCase
 * JSX-returning function living alongside a test).
 */
export function TopoSceneHarness({
  elapsedSec,
  mx,
  my,
}: TopoSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  const drift = useSharedValue({ mx, my });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <TopoScene
        elapsedSec={elapsed}
        drift={drift}
        width={390}
        height={844}
        theme={rnThemeTokens.holo.dark}
      />
    </ThemeContext.Provider>
  );
}

interface TopoSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}
