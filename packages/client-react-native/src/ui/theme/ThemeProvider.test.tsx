// packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

test("provides the token cell for the resolved skin × mode", async () => {
  await renderProbe(fakeViewModel("terminal", "light"));
  expect(screen.getByTestId("probe").props.children).toBe(
    rnThemeTokens.terminal.light.bgTile,
  );
});

test("useTheme throws outside a provider", async () => {
  // RNTL 14's render is async: the guard throws during the act flush, so the
  // render promise rejects rather than throwing synchronously.
  await expect(renderProbe(null)).rejects.toThrow(/ThemeProvider/);
});

test("fills the platform system monospace for the classic skin", async () => {
  // classic bundles no mono font (token `fontMono` is undefined); the provider
  // must resolve it to a real platform monospace so digits align. Before the
  // resolution this rendered `undefined`.
  await renderProbe(fakeViewModel("classic", "dark"));
  const mono = screen.getByTestId("probe-mono").props.children;
  expect(typeof mono).toBe("string");
  expect(mono.length).toBeGreaterThan(0);
});

// Probe lives nested inside the helper (not at module scope) so the file has no
// unexported top-level component — mirrors client-react's useTheme.test.tsx and
// satisfies Biome's useComponentExportOnlyModules. A null viewModel renders the
// probe bare (outside any provider) to exercise the useTheme guard.
function renderProbe(viewModel: ViewModel | null): Promise<unknown> {
  function Probe(): React.JSX.Element {
    const theme = useTheme();
    return (
      <>
        <Text testID="probe">{theme.bgTile}</Text>
        <Text testID="probe-mono">{theme.fontMono}</Text>
      </>
    );
  }

  if (viewModel === null) {
    return render(<Probe />);
  }

  return render(
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </ViewModelProvider>,
  );
}

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
