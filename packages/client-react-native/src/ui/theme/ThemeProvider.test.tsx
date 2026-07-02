// packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

function Probe(): React.JSX.Element {
  const theme = useTheme();
  return <Text testID="probe">{theme.bgTile}</Text>;
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

test("provides the token cell for the resolved skin × mode", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel("terminal", "light")}>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("probe").props.children).toBe(
    rnThemeTokens.terminal.light.bgTile,
  );
});

test("useTheme throws outside a provider", async () => {
  await expect(render(<Probe />)).rejects.toThrow(/ThemeProvider/);
});
