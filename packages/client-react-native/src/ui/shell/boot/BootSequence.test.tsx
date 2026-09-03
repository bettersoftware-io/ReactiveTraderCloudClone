import { afterEach, expect, jest, test } from "@jest/globals";
import { AccessibilityInfo } from "react-native";

import { BOOT_VARIANTS } from "@rtc/domain";

import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { bootSequencePage } from "#tests/pages/BootSequencePage";

const mockUseBootMotionEnabled = jest.fn<() => boolean>();
const page = bootSequencePage();

afterEach(() => {
  page.unmountAll();
});

test("renders the wordmark, the SEQ line and the progress log line", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await page.mount({ variant: "laser", progress: 42, done: false });
  expect(page.exists("boot-wordmark")).toBe(true);
  // `laser` is second in the cycle; the total is the real variant count, not
  // the prototype's hard-coded 8 (they agree today — the assertion is what
  // keeps them agreeing).
  expect(page.textOf("boot-variant")).toBe(
    `MOBILE OS  //  SEQ 2/${BOOT_VARIANTS.length} · UI DRAW-IN`,
  );
  // 42% lands on floor(0.42 * 7) === index 2 of the seven prototype logs.
  expect(page.textOf("boot-log")).toBe("▸ WS HANDSHAKE wss://rtc-clone");
  // The percentage numeral is gone: the design's rail is bare.
  expect(page.exists("boot-pct")).toBe(false);
});

test("SKIP renders as the design's bordered pill", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await page.mount({ variant: "core", progress: 0, done: false });
  const style = page.styleOf("boot-skip");

  expect(page.hasText("SKIP ▸")).toBe(true);
  expect(style.borderWidth).toBe(1);
  expect(style.borderRadius).toBe(6);
  expect(style.right).toBe(16);
  // dc.html:620's literal 26 — NOT 26 + the bottom safe-area inset. The design
  // seats the pill over the home-indicator zone; adding the inset (34 on this
  // device) lifted it onto the log line.
  expect(style.bottom).toBe(26);
});

test("paints the chrome in the bundled faces, never the system font", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  const theme = rnThemeTokens.holo3d.dark;
  await page.mount(
    { variant: "core", progress: 42, done: false },
    undefined,
    theme,
  );

  // A golden captured before the families registered pinned all three of these
  // in SF for weeks (fixed in `BootSequenceFixture`, which now mounts after
  // `useAppFonts()`); these assertions pin the styles themselves so a future
  // edit cannot drop a family or spread an undefined weighted face over one.
  expect(page.styleOf("boot-wordmark").fontFamily).toBe(FONT_ORBITRON_WORDMARK);
  expect(page.styleOf("boot-variant").fontFamily).toBe(theme.fontMono);
  expect(page.styleOf("boot-log").fontFamily).toBe(theme.fontMono);
  expect(theme.fontMono).toBeTruthy();
});

test("SKIP press dispatches the skip intent", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  const skip = jest.fn();
  await page.mount({ variant: "core", progress: 10, done: false }, skip);
  await page.press("boot-skip");
  expect(skip).toHaveBeenCalledTimes(1);
});

test("motion disabled: chrome + emblem render, no Skia canvas", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await page.mount({ variant: "core", progress: 5, done: false });
  expect(page.exists("boot-sequence")).toBe(true);
  expect(page.exists("boot-wordmark")).toBe(true);
  expect(page.exists("boot-variant")).toBe(true);
  expect(page.exists("boot-progress")).toBe(true);
  expect(page.exists("boot-log")).toBe(true);
  expect(page.exists("boot-skip")).toBe(true);
  expect(page.exists("boot-emblem")).toBe(true);
  expect(page.exists("boot-canvas")).toBe(false);
});

test("motion enabled on a covered variant: canvas renders, emblem does not", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  await page.mount({ variant: "core", progress: 5, done: false });
  expect(page.exists("boot-sequence")).toBe(true);
  expect(page.exists("boot-wordmark")).toBe(true);
  expect(await page.awaitExists("boot-canvas")).toBe(true);
  expect(page.exists("boot-emblem")).toBe(false);
});

test("motion enabled on an unported variant: emblem falls back, no canvas", async () => {
  // The boot rotation cycles all eight variants but only core/laser have Skia
  // scenes in 6a, so this is the majority runtime path today: a motion-enabled
  // boot landing on a scene-less variant must still show the static emblem.
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  await page.mount({ variant: "docking", progress: 5, done: false });
  expect(page.exists("boot-emblem")).toBe(true);
  expect(page.exists("boot-canvas")).toBe(false);
});

test("SKIP still dispatches while the Skia canvas is showing", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  const skip = jest.fn();
  await page.mount({ variant: "core", progress: 10, done: false }, skip);
  await page.press("boot-skip");
  expect(skip).toHaveBeenCalledTimes(1);
});

jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
    },
  };
});

jest.mock("#/ui/shell/boot/useBootMotionEnabled", () => {
  return {
    useBootMotionEnabled: () => {
      return mockUseBootMotionEnabled();
    },
  };
});

// A tiny stub scene registered under "core" only, mirroring BootCanvas's own
// test mock — keeps this test independent of the real CoreScene/LaserScene
// geometry and lets `hasBootScene` be driven directly per assertion.
jest.mock("#/ui/shell/boot/bootScene", () => {
  const React = require("react");
  const { View } = require("react-native");

  function StubScene(): unknown {
    return React.createElement(View, { testID: "boot-scene-core" });
  }

  return {
    BOOT_SCENES: { core: StubScene },
    hasBootScene: (variant: string) => {
      return variant === "core";
    },
  };
});
