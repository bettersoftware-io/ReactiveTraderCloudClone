// packages/client-react-native/src/ui/shell/boot/scenes/HologramSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { HologramScene } from "#/ui/shell/boot/scenes/HologramScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `HologramScene.test.tsx`, mirroring `CoreSceneHarness`
 * rather than `DockingSceneHarness`: `HologramScene` DOES read gyro drift, so
 * `mx`/`my` are accepted as parameters and a test can sweep them.
 *
 * Lives in its own module for the same Biome reasons as the other harnesses
 * (`noExportsInTest` forbids exporting from a `*.test.tsx` file, and
 * `useComponentExportOnlyModules` forbids an unexported PascalCase
 * JSX-returning function living alongside a test).
 */
export function HologramSceneHarness({
  elapsedSec,
  mx,
  my,
}: HologramSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  const drift = useSharedValue({ mx, my });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <HologramScene
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

interface HologramSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}
