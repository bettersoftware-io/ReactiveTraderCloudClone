import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders nothing when closed", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open={false} onClose={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("appearance-overlay")).toBeNull();
});

test("shows the appearance panel when open and closes on request", async () => {
  const onClose = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("appearance-overlay")).toBeTruthy();
  expect(screen.getByTestId("appearance-panel")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("appearance-close"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

function vm(): ViewModel {
  return {
    useThemePreference: () => {
      return { mode: "dark", modePreference: "dark", cycle: (): void => {} };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin: (): void => {} };
    },
    useAnimatedBackground: () => {
      return {
        enabled: false,
        setEnabled: (): void => {},
        toggle: (): void => {},
      };
    },
    usePowerSaver: () => {
      return {
        level: "off",
        isCalm: false,
        isFreeze: false,
        setLevel: (): void => {},
        cycle: (): void => {},
      };
    },
    useAmbientStyle: () => {
      return { style: "aurora", setStyle: (): void => {} };
    },
    useBootGate: () => {
      return {
        visible: false,
        reboot: (): void => {},
        dismiss: (): void => {},
      };
    },
    // Required since P7 put `LogoutButton` in the sheet (via `AppearanceScreen`).
    useAuth: () => {
      return { logout: (): void => {} };
    },
  } as unknown as ViewModel;
}

// Same shape ShellHeader.test.tsx uses: the overlay is `absoluteFill`, so it
// owns a top safe-area inset (the header used to draw under the status bar).
// iPhone 17 values, so the pad is a realistic number rather than 0.
jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
    },
  };
});
