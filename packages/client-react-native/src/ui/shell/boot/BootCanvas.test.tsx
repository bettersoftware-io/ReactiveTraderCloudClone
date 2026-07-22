import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockUseBootMotionEnabled = jest.fn<() => boolean>();
const { BootCanvas } = require("./BootCanvas") as typeof import("./BootCanvas");

// BootCanvas reads the theme (to thread into the scene, since Skia's Canvas is
// a separate reconciler React Context can't cross) — so every render needs a
// ThemeProvider, via renderWithTheme.
test("renders nothing when boot motion is disabled, even for a covered variant", async () => {
  mockUseBootMotionEnabled.mockReturnValue(false);
  await renderWithTheme(<BootCanvas variant="core" />);
  expect(screen.queryByTestId("boot-canvas")).toBeNull();
  expect(screen.queryByTestId("boot-scene-core")).toBeNull();
});

test("renders nothing for an unported variant, even when motion is enabled", async () => {
  mockUseBootMotionEnabled.mockReturnValue(true);
  await renderWithTheme(<BootCanvas variant="topo" />);
  expect(screen.queryByTestId("boot-canvas")).toBeNull();
  expect(screen.queryByTestId("boot-scene-core")).toBeNull();
});

test("renders the canvas and scene for a covered variant when motion is enabled", async () => {
  mockUseBootMotionEnabled.mockReturnValue(true);
  await renderWithTheme(<BootCanvas variant="core" />);
  expect(await screen.findByTestId("boot-canvas")).toBeTruthy();
  expect(await screen.findByTestId("boot-scene-core")).toBeTruthy();
});

jest.mock("#/ui/shell/boot/useBootMotionEnabled", () => {
  return {
    useBootMotionEnabled: () => {
      return mockUseBootMotionEnabled();
    },
  };
});

// A tiny stub scene registered under "core" only — the real registry (Task 4)
// starts empty; Tasks 6/7 register `core`/`laser` for real. Mocking the
// module keeps this test independent of those not-yet-written scenes.
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
