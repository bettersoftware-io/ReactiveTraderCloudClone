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

// Probe lives nested inside the helper (not at module scope) so the file has no
// unexported top-level component — mirrors client-react's useTheme.test.tsx and
// satisfies Biome's useComponentExportOnlyModules. A null viewModel renders the
// probe bare (outside any provider) to exercise the useTheme guard.
function renderProbe(viewModel: ViewModel | null): Promise<unknown> {
  function Probe(): React.JSX.Element {
    const theme = useTheme();
    return <Text testID="probe">{theme.bgTile}</Text>;
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
