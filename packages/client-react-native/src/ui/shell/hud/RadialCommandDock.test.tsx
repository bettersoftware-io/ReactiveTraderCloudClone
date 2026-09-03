// packages/client-react-native/src/ui/shell/hud/RadialCommandDock.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";
import type { JSX } from "react";

import { radialCommandDockPage } from "#tests/pages/RadialCommandDockPage";

const mockNavigate = jest.fn();
const page = radialCommandDockPage();

afterEach(() => {
  return page.unmountAll();
});

test("is collapsed until the FAB is pressed", async () => {
  await page.mount();
  expect(page.exists("hud-dock-sat-blotter")).toBe(false);
});

test("starts fanned out when DockOpenContext pins it open", async () => {
  await page.mount(true);
  expect(page.exists("hud-dock-sat-rates")).toBe(true);
  expect(page.exists("hud-dock-sat-equities")).toBe(true);
});

test("fans out 5 satellites when opened", async () => {
  await page.mount();
  await page.pressFab();
  expect(page.exists("hud-dock-sat-rates")).toBe(true);
  expect(page.exists("hud-dock-sat-blotter")).toBe(true);
  expect(page.exists("hud-dock-sat-analytics")).toBe(true);
  expect(page.exists("hud-dock-sat-credit")).toBe(true);
  expect(page.exists("hud-dock-sat-equities")).toBe(true);
});

test("keeps the longest satellite label on one line", async () => {
  // `ANALYTICS` is wider than the 58px satellite column, so it wrapped to
  // `ANALYTIC`/`S` until the label got a width of its own — the design's
  // label overflows the column instead (dc.html:479).
  await page.mount();
  await page.pressFab();
  expect(page.satelliteNumberOfLines("ANALYTICS")).toBe(1);
});

test("selecting a satellite navigates to its route and closes", async () => {
  await page.mount();
  await page.pressFab();
  await page.pressSatellite("credit");
  expect(mockNavigate).toHaveBeenCalledWith("/credit");
  expect(page.exists("hud-dock-sat-credit")).toBe(false);
});

test("shows the active module's glyph on the FAB, then ✕ while open", async () => {
  await page.mount();
  expect(page.fabShowsGlyph("⇅")).toBe(true);

  await page.pressFab();
  expect(page.fabShowsGlyph("✕")).toBe(true);
});

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

jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
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
