// packages/client-react-native/tests/pages/ThemeProviderPage.tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { useTheme } from "#/ui/theme/useTheme";

function fakeViewModel(skin: string, mode: string): ViewModel {
  return {
    useThemePreference: () => {
      return { mode, modePreference: mode, cycle: () => {} };
    },
    useThemeSkinPreference: () => {
      return { skin, setSkin: () => {} };
    },
  } as unknown as ViewModel;
}

export interface ThemeProviderPage {
  /** Mounts the probe under a `ThemeProvider`, fed by a fake `skin` × `mode`
   * preference pair. */
  mount(skin: string, mode: string): Promise<void>;
  /** Mounts the probe with NO provider above it — the return value is the
   * render promise itself (not awaited here), so the caller can assert it
   * rejects. */
  mountBare(): Promise<unknown>;
  bgTile(): unknown;
  fontMono(): unknown;
}

/** The framework surface for `ThemeProvider.test.tsx`. */
export function themeProviderPage(): ThemeProviderPage {
  // Nested inside the factory body (not module scope) so the file has no
  // unexported top-level component — mirrors `UseActiveModulePage`'s
  // precedent and satisfies Biome's `useComponentExportOnlyModules`. A null
  // viewModel renders the probe bare (outside any provider) to exercise the
  // useTheme guard.
  function Probe(): React.JSX.Element {
    const theme = useTheme();
    return (
      <>
        <Text testID="probe">{theme.bgTile}</Text>
        <Text testID="probe-mono">{theme.fontMono}</Text>
      </>
    );
  }

  return {
    async mount(skin: string, mode: string): Promise<void> {
      await render(
        <ViewModelProvider viewModel={fakeViewModel(skin, mode)}>
          <ThemeProvider>
            <Probe />
          </ThemeProvider>
        </ViewModelProvider>,
      );
    },
    mountBare(): Promise<unknown> {
      return render(<Probe />);
    },
    bgTile(): unknown {
      return screen.getByTestId("probe").props.children;
    },
    fontMono(): unknown {
      return screen.getByTestId("probe-mono").props.children;
    },
  };
}
