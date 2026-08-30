import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { StyleSheet, type TextStyle } from "react-native";

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

// Orbitron's advance for "REACTIVE TRADER" at 11pt with 2.2 tracking, from
// the font's own hmtx table: 155.56pt, or 157.76 if iOS kerns past the last
// glyph too. The wordmark box must reserve at least that.
const ORBITRON_WORDMARK_ADVANCE = 155.56;

test("the wordmark box reserves Orbitron's real advance, so the trailing ER cannot be clipped off", async () => {
  await render(
    <ShellHeader
      simulator
      onToggleSimulator={(): void => {}}
      onOpenAppearance={(): void => {}}
    />,
  );

  const style = StyleSheet.flatten(
    screen.getByTestId("hud-wordmark").props.style as TextStyle,
  );

  // iOS measures this Text in the system font, not in Orbitron, and sized it
  // at 132.7pt — narrow enough to clip "REACTIVE TRADER" to "REACTIVE TRAD".
  expect(style.minWidth).toBeGreaterThanOrEqual(ORBITRON_WORDMARK_ADVANCE);
  // ...and the row must never claw that width back by squeezing the wordmark.
  expect(style.flexShrink).toBe(0);
});

interface ShellHeaderTestProps {
  simulator: boolean;
  onToggleSimulator: (v: boolean) => void;
  onOpenAppearance: () => void;
}

interface ShellHeaderTestModule {
  ShellHeader: (p: ShellHeaderTestProps) => JSX.Element;
}

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

// No `LogoutButton` mock: P7 moved sign-out out of the header and into the
// Appearance sheet, so the header no longer imports it. A mock for a component
// this file never renders would be dead weight that still reads as intent.
