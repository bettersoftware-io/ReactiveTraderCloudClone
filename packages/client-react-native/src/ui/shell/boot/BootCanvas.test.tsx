import { afterEach, expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import * as Reanimated from "react-native-reanimated";
import { useSharedValue } from "react-native-reanimated";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BootClockContext } from "./BootClockContext";
import type { BootSceneProps } from "./bootScene";

const mockUseBootMotionEnabled = jest.fn<() => boolean>();
const mockUseGyroDrift = jest.fn((_enabled: boolean) => {
  return { value: { mx: 0, my: 0 } };
});
/** The props the stub scene was last drawn with — how a test sees what the
 * canvas actually handed to the scene (the pinned clock, or the live one). */
const mockSceneProps: SceneProbe = { current: null };
const { BootCanvas } = require("./BootCanvas") as typeof import("./BootCanvas");

afterEach(() => {
  jest.restoreAllMocks();
  mockSceneProps.current = null;
});

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

test("a BootClockContext pin drives the scene: pinned elapsedSec and now, frame clock never started, gyroscope never subscribed", async () => {
  mockUseBootMotionEnabled.mockReturnValue(true);
  const setActive = jest.fn();
  jest
    .spyOn(Reanimated, "useFrameCallback")
    .mockReturnValue({ setActive, isActive: false, callbackId: -1 });
  const now = new Date(2026, 6, 27, 9, 41, 7);
  await mountPinned(2.52, now);
  expect(await screen.findByTestId("boot-scene-core")).toBeTruthy();
  expect(mockSceneProps.current?.elapsedSec.value).toBe(2.52);
  expect(mockSceneProps.current?.now).toBe(now);
  expect(setActive).toHaveBeenCalledWith(false);
  expect(setActive).not.toHaveBeenCalledWith(true);
  expect(mockUseGyroDrift).toHaveBeenLastCalledWith(false);
});

test("without a pin the live clock drives the scene: frame callback activated, gyroscope subscribed, no wall clock", async () => {
  mockUseBootMotionEnabled.mockReturnValue(true);
  const setActive = jest.fn();
  jest
    .spyOn(Reanimated, "useFrameCallback")
    .mockReturnValue({ setActive, isActive: false, callbackId: -1 });
  await renderWithTheme(<BootCanvas variant="core" />);
  expect(await screen.findByTestId("boot-scene-core")).toBeTruthy();
  expect(mockSceneProps.current?.elapsedSec.value).toBe(0);
  expect(mockSceneProps.current?.now).toBeUndefined();
  expect(setActive).toHaveBeenCalledWith(true);
  expect(mockUseGyroDrift).toHaveBeenLastCalledWith(true);
});

/** Mounts the canvas under a pin whose shared value comes from a real hook
 * call inside a component, the way `BootSequenceFixture` builds it. */
async function mountPinned(elapsedSec: number, now: Date): Promise<void> {
  function PinnedCanvas(): ReactNode {
    const pinnedElapsed = useSharedValue(elapsedSec);

    return (
      <BootClockContext.Provider value={{ elapsedSec: pinnedElapsed, now }}>
        <BootCanvas variant="core" />
      </BootClockContext.Provider>
    );
  }

  await renderWithTheme(<PinnedCanvas />);
}

/** Where the stub scene parks its last props for a test to read. */
interface SceneProbe {
  current: BootSceneProps | null;
}

// `BootCanvas` reads the top safe-area inset to push each scene's telemetry
// below the status bar / Dynamic Island, and this suite mounts it outside any
// `SafeAreaProvider`.
jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
    },
  };
});

jest.mock("#/ui/shell/boot/useGyroDrift", () => {
  return {
    useGyroDrift: (enabled: boolean) => {
      return mockUseGyroDrift(enabled);
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

// A tiny stub scene registered under "core" only — the real registry (Task 4)
// starts empty; Tasks 6/7 register `core`/`laser` for real. Mocking the
// module keeps this test independent of those not-yet-written scenes.
jest.mock("#/ui/shell/boot/bootScene", () => {
  const React = require("react");
  const { View } = require("react-native");

  function StubScene(props: unknown): unknown {
    mockSceneProps.current = props as typeof mockSceneProps.current;
    return React.createElement(View, { testID: "boot-scene-core" });
  }

  return {
    BOOT_SCENES: { core: StubScene },
    hasBootScene: (variant: string) => {
      return variant === "core";
    },
  };
});
