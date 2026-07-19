import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";

jest.mock("./HexReticleLogo", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    HexReticleLogo: (): unknown => {
      return react.createElement(Text, { testID: "hud-logo" });
    },
  };
});
jest.mock("./useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return true;
    },
  };
});
jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: (): unknown => {
      return {
        useConnectionStatus: (): string => {
          return "CONNECTED";
        },
      };
    },
  };
});
jest.mock("@rtc/domain", () => {
  return { ConnectionStatus: { CONNECTED: "CONNECTED" } };
});
jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
    },
  };
});
// ShellHeader (and useThemedStyles, transitively) call useTheme() directly
// rather than only consuming pre-themed children, so — mirroring
// HexReticleLogo.test.tsx's pattern — the theme module is mocked rather than
// wrapping the tree in a ThemeContext.Provider.
jest.mock("#/ui/theme/useTheme", () => {
  const { rnThemeTokens } = require("#/ui/theme/tokens");
  return {
    useTheme: (): unknown => {
      return rnThemeTokens.holo.dark;
    },
  };
});
jest.mock("#/ui/shell/appearance/AppearanceButton", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    AppearanceButton: (): unknown => {
      return react.createElement(Text, null, "Theme");
    },
  };
});
jest.mock("#/ui/shell/lock/LockButton", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    LockButton: (): unknown => {
      return react.createElement(Text, null, "Lock");
    },
  };
});
jest.mock("#/ui/shell/auth/LogoutButton", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    LogoutButton: (): unknown => {
      return react.createElement(Text, null, "Sign out");
    },
  };
});

// Imported after the mocks are registered.
const { ShellHeader } = require("./ShellHeader") as ShellHeaderTestModule;

test("env badge reads LIVE when not in simulator mode", async () => {
  await render(
    <ShellHeader
      simulator={false}
      onToggleSimulator={(): void => {}}
      onOpenAppearance={(): void => {}}
    />,
  );
  expect(screen.getByTestId("hud-env-badge")).toHaveTextContent("LIVE");
});

test("tapping the env badge toggles the simulator flag", async () => {
  const onToggle = jest.fn();
  await render(
    <ShellHeader
      simulator={false}
      onToggleSimulator={onToggle}
      onOpenAppearance={(): void => {}}
    />,
  );
  await fireEvent.press(screen.getByTestId("hud-env-badge"));
  expect(onToggle).toHaveBeenCalledWith(true);
});

interface ShellHeaderTestProps {
  simulator: boolean;
  onToggleSimulator: (v: boolean) => void;
  onOpenAppearance: () => void;
}

interface ShellHeaderTestModule {
  ShellHeader: (p: ShellHeaderTestProps) => JSX.Element;
}
