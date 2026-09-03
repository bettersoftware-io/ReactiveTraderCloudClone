// packages/client-react-native/src/ui/shell/hud/ShellHeader.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";

import { FONT_JETBRAINS_MONO_600 } from "#/ui/theme/fontFamilies";
import { shellHeaderPage } from "#tests/pages/ShellHeaderPage";

const page = shellHeaderPage();

afterEach(() => {
  return page.unmountAll();
});

test("env badge reads LIVE when not in simulator mode", async () => {
  await page.mount(false);
  expect(page.hasTextContent("hud-env-badge", "LIVE")).toBe(true);
});

test("tapping the env badge toggles the simulator flag", async () => {
  const onToggle = jest.fn();
  await page.mount(false, onToggle);
  await page.pressEnvBadge();
  expect(onToggle).toHaveBeenCalledWith(true);
});

// Orbitron's advance for "REACTIVE TRADER" at 11pt with 2.2 tracking, from
// the font's own hmtx table: 155.56pt, or 157.76 if iOS kerns past the last
// glyph too. The wordmark box must reserve at least that.
const ORBITRON_WORDMARK_ADVANCE = 155.56;

test("the wordmark box reserves Orbitron's real advance, so the trailing ER cannot be clipped off", async () => {
  await page.mount(true);

  const style = page.wordmarkStyle();

  // iOS measures this Text in the system font, not in Orbitron, and sized it
  // at 132.7pt — narrow enough to clip "REACTIVE TRADER" to "REACTIVE TRAD".
  expect(style.minWidth).toBeGreaterThanOrEqual(ORBITRON_WORDMARK_ADVANCE);
  // ...and the row must never claw that width back by squeezing the wordmark.
  expect(style.flexShrink).toBe(0);
});

// The env badge is the weighted arm of the `labelStyle` family: holo bundles
// a real JetBrains SemiBold cut, so the label must name that FAMILY and carry
// no `fontWeight` — a faux bold would read heavier than the design.
test("the env badge keeps the 9pt / 1-tracked mono label in the real 600 cut", async () => {
  await page.mount(false);

  const style = page.styleOfText("LIVE");

  expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO_600);
  expect(style.fontSize).toBe(9);
  expect(style.letterSpacing).toBe(1);
  expect(style.fontWeight).toBeUndefined();
});

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
