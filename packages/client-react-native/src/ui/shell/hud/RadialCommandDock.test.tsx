// packages/client-react-native/src/ui/shell/hud/RadialCommandDock.test.tsx
import { expect, jest, test } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { JSX } from "react";

const mockNavigate = jest.fn();

jest.mock("expo-router", () => {
  return {
    useRouter: (): unknown => {
      return { navigate: mockNavigate };
    },
    usePathname: (): string => {
      return "/";
    },
  };
});
jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return {
    BlurView: (p: Record<string, unknown>): JSX.Element => {
      return <View {...p} />;
    },
  };
});
jest.mock("./useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return false;
    },
  };
});
jest.mock("#/ui/theme/useTheme", () => {
  const { rnThemeTokens } = require("#/ui/theme/tokens");
  return {
    useTheme: (): unknown => {
      return rnThemeTokens.holo.dark;
    },
  };
});

const { RadialCommandDock } =
  require("./RadialCommandDock") as RadialCommandDockModule;

test("is collapsed until the FAB is pressed", async () => {
  await render(<RadialCommandDock />);
  expect(screen.queryByTestId("hud-dock-sat-blotter")).toBeNull();
});

test("fans out 5 satellites when opened", async () => {
  await render(<RadialCommandDock />);
  await fireEvent.press(screen.getByTestId("hud-dock-fab"));
  expect(screen.getByTestId("hud-dock-sat-rates")).toBeTruthy();
  expect(screen.getByTestId("hud-dock-sat-blotter")).toBeTruthy();
  expect(screen.getByTestId("hud-dock-sat-analytics")).toBeTruthy();
  expect(screen.getByTestId("hud-dock-sat-credit")).toBeTruthy();
  expect(screen.getByTestId("hud-dock-sat-equities")).toBeTruthy();
});

test("selecting a satellite navigates to its route and closes", async () => {
  await render(<RadialCommandDock />);
  await fireEvent.press(screen.getByTestId("hud-dock-fab"));
  await fireEvent.press(screen.getByTestId("hud-dock-sat-credit"));
  expect(mockNavigate).toHaveBeenCalledWith("/credit");
  expect(screen.queryByTestId("hud-dock-sat-credit")).toBeNull();
});

test("shows the active module's glyph on the FAB, then ✕ while open", async () => {
  await render(<RadialCommandDock />);
  const fab = within(screen.getByTestId("hud-dock-fab"));
  expect(fab.getByText("⇅")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("hud-dock-fab"));
  expect(fab.getByText("✕")).toBeTruthy();
});

interface RadialCommandDockModule {
  RadialCommandDock: () => JSX.Element;
}
