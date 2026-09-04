// packages/client-react-native/tests/pages/AmbientBackgroundPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";

import type { AmbientStyle, PowerSaverLevel } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

interface AmbientMountOptions {
  readonly animatedBackground: boolean;
  /** Defaults to "rays" — irrelevant to the first two (enable-gate) tests. */
  readonly ambientStyle?: AmbientStyle;
  /** Defaults to "off", production's default. */
  readonly powerSaverLevel?: PowerSaverLevel;
}

// Minimal in-test PreferencesPort-shaped stub: only the ViewModel seams
// AmbientBackground actually reads (useAnimatedBackground, useAmbientStyle,
// and usePowerSaver through useShellMotionEnabled), mirroring
// AppearanceScreen.test.tsx's fakeViewModel pattern. `enabled` mirrors
// AsyncStoragePreferencesAdapter's `animatedBg` field (mobile default: false).
function fakeViewModel({
  animatedBackground,
  ambientStyle = "rays",
  powerSaverLevel = "off",
}: AmbientMountOptions): ViewModel {
  return {
    usePowerSaver: () => {
      return {
        level: powerSaverLevel,
        isCalm: powerSaverLevel !== "off",
        isFreeze: powerSaverLevel === "freeze",
        setLevel: () => {},
        cycle: () => {},
      };
    },
    useAnimatedBackground: () => {
      return {
        enabled: animatedBackground,
        setEnabled: () => {},
        toggle: () => {},
      };
    },
    useAmbientStyle: () => {
      return { style: ambientStyle, setStyle: () => {} };
    },
  } as unknown as ViewModel;
}

export interface AmbientBackgroundPage {
  mount(options: AmbientMountOptions): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  awaitExists(testId: string): Promise<boolean>;
}

/** The framework surface for `AmbientBackground.test.tsx`. */
export function ambientBackgroundPage(): AmbientBackgroundPage {
  return {
    async mount(options: AmbientMountOptions): Promise<void> {
      await render(
        <ViewModelProvider viewModel={fakeViewModel(options)}>
          <ThemeContext.Provider value={rnThemeTokens.neon.dark}>
            <AmbientBackground />
          </ThemeContext.Provider>
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async awaitExists(testId: string): Promise<boolean> {
      await screen.findByTestId(testId);
      return true;
    },
  };
}
