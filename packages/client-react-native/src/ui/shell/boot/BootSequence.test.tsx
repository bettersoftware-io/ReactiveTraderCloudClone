import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockUseBootMotionEnabled = jest.fn<() => boolean>();

test("renders wordmark, variant tag and progress percent", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "laser", progress: 42, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
  expect(screen.getByTestId("boot-variant").props.children).toEqual([
    "SEQUENCE · ",
    "LASER",
  ]);
  expect(screen.getByTestId("boot-pct").props.children).toEqual([42, "%"]);
});

test("SKIP press dispatches the skip intent", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  const skip = jest.fn();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 10, done: false },
        skip,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("boot-skip"));
  expect(skip).toHaveBeenCalledTimes(1);
});

test("motion disabled: chrome + emblem render, no Skia canvas", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 5, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-sequence")).toBeTruthy();
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
  expect(screen.getByTestId("boot-variant")).toBeTruthy();
  expect(screen.getByTestId("boot-progress")).toBeTruthy();
  expect(screen.getByTestId("boot-pct")).toBeTruthy();
  expect(screen.getByTestId("boot-skip")).toBeTruthy();
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
  expect(screen.queryByTestId("boot-canvas")).toBeNull();
});

test("motion enabled on a covered variant: canvas renders, emblem does not", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 5, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-sequence")).toBeTruthy();
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
  expect(await screen.findByTestId("boot-canvas")).toBeTruthy();
  expect(screen.queryByTestId("boot-emblem")).toBeNull();
});

test("SKIP still dispatches while the Skia canvas is showing", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  const skip = jest.fn();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 10, done: false },
        skip,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("boot-skip"));
  expect(skip).toHaveBeenCalledTimes(1);
});

interface BootState {
  variant: "core" | "laser" | "docking";
  progress: number;
  done: boolean;
}

function fakeViewModel(state: BootState, skip: () => void): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return { state, skip };
    },
  } as unknown as ViewModel;
}

function noop(): void {
  // intentionally empty
}

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
