// packages/client-react-native/tests/pages/HexReticleLogoPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";

import { HexReticleLogo } from "#/ui/shell/hud/HexReticleLogo";

export interface HexReticleLogoPage {
  mount(): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
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
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
