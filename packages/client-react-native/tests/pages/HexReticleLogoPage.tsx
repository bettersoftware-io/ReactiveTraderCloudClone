// packages/client-react-native/tests/pages/HexReticleLogoPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";

import { HexReticleLogo } from "#/ui/shell/hud/HexReticleLogo";

export interface HexReticleLogoPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  /** The view rotation of a turning layer (`hud-logo-ring`,
   * `hud-logo-triangles`), or `null` when it has none. */
  layerRotation(testId: string): string | null;
}

/** The framework surface for `HexReticleLogo.test.tsx`. Relies on the
 * spec's own `jest.mock` calls for `useShellMotionEnabled`/`useTheme` —
 * hoisted by babel-jest above every import in the SPEC file, including its
 * import of this page module, so `HexReticleLogo`'s transitive imports
 * resolve through the mocks by the time this page's `mount()` runs. */
export function hexReticleLogoPage(): HexReticleLogoPage {
  return {
    async mount(): Promise<void> {
      await render(<HexReticleLogo />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    layerRotation(testId: string): string | null {
      const layer = screen.queryByTestId(testId);
      const transform = StyleSheet.flatten(
        layer?.props.style as StyleProp<ViewStyle>,
      )?.transform;

      const rotate = Array.isArray(transform)
        ? (transform as readonly Record<string, unknown>[]).find((step) => {
            return "rotate" in step;
          })?.rotate
        : undefined;

      return typeof rotate === "string" ? rotate : null;
    },
  };
}
