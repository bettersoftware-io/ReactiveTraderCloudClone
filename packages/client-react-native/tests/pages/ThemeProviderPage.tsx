// packages/client-react-native/tests/pages/ThemeProviderPage.tsx
import {
  cleanup,
  type RenderResult,
  render,
  screen,
} from "@testing-library/react-native";
import { Text } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import type { RnTheme } from "#/ui/theme/tokens";
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
  unmountAll(): Promise<void>;
  /** Mounts the probe with NO provider above it — the return value is the
   * render promise itself (not awaited here), so the caller can assert it
   * rejects. The spec only ever observes the REJECTED path (`useTheme`
   * throws outside a provider); a resolved `RenderResult` is what RNTL's
   * `render()` itself is typed to return. */
  mountBare(): Promise<RenderResult>;
  bgTile(): RnTheme["bgTile"];
  fontMono(): RnTheme["fontMono"];
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
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    mountBare(): Promise<RenderResult> {
      return render(<Probe />);
    },
    bgTile(): RnTheme["bgTile"] {
      return screen.getByTestId("probe").props.children as RnTheme["bgTile"];
    },
    fontMono(): RnTheme["fontMono"] {
      return screen.getByTestId("probe-mono").props
        .children as RnTheme["fontMono"];
    },
  };
}
