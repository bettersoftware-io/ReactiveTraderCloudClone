// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("shows the current mode preference and cycles on press", async () => {
  const cycle = jest.fn();
  await renderScreen(fakeViewModel(cycle, () => {}));
  expect(screen.getByTestId("appearance-mode")).toBeTruthy();
  fireEvent.press(screen.getByTestId("appearance-mode"));
  expect(cycle).toHaveBeenCalledTimes(1);
});

test("selects a skin on press", async () => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  fireEvent.press(screen.getByTestId("appearance-skin-terminal"));
  expect(setSkin).toHaveBeenCalledWith("terminal");
});

test("marks the active skin selected", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByTestId("appearance-skin-holo-active")).toBeTruthy();
});

function fakeViewModel(
  cycle: () => void,
  setSkin: (s: string) => void,
): ViewModel {
  return {
    useThemePreference: () => {
      return { mode: "dark", modePreference: "system", cycle };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin };
    },
  } as unknown as ViewModel;
}

function renderScreen(vm: ViewModel): Promise<unknown> {
  return render(
    <ViewModelProvider viewModel={vm}>
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <AppearanceScreen />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
}
