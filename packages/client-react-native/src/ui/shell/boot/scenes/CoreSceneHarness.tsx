// packages/client-react-native/src/ui/shell/boot/scenes/CoreSceneHarness.tsx
import type { JSX } from "react";
import { useSharedValue } from "react-native-reanimated";

import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/**
 * Test-only harness for `CoreScene.test.tsx`: wraps it in a fixed theme
 * (mirroring `renderWithTheme`, which only wraps an *initial* render) and
 * turns its `elapsedSec`/`mx`/`my` numbers into fresh shared values on every
 * render, so a test can drive the scene across the boot timeline purely by
 * re-rendering with new prop values.
 *
 * Lives in its own module (not inline in the test file) because Biome's
 * `noExportsInTest` forbids exporting from a `*.test.tsx` file, and a
 * PascalCase JSX-returning function must either be exported or not exist in
 * a file at all (`useComponentExportOnlyModules`) — it can't be a private,
 * unexported helper inside the test file either.
 */
export function CoreSceneHarness({
  elapsedSec,
  mx,
  my,
}: CoreSceneHarnessProps): JSX.Element {
  const elapsed = useSharedValue(elapsedSec);
  const drift = useSharedValue({ mx, my });
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <CoreScene elapsedSec={elapsed} drift={drift} width={390} height={844} />
    </ThemeContext.Provider>
  );
}

interface CoreSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}
