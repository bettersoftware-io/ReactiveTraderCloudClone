import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { BOOT_VARIANTS } from "@rtc/domain";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockUseBootMotionEnabled = jest.fn<() => boolean>();

test("renders the wordmark, the SEQ line and the progress log line", async () => {
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
  // `laser` is second in the cycle; the total is the real variant count, not
  // the prototype's hard-coded 8 (they agree today — the assertion is what
  // keeps them agreeing).
  expect(screen.getByTestId("boot-variant").props.children).toBe(
    `MOBILE OS  //  SEQ 2/${BOOT_VARIANTS.length} · UI DRAW-IN`,
  );
  // 42% lands on floor(0.42 * 7) === index 2 of the seven prototype logs.
  expect(screen.getByTestId("boot-log").props.children).toBe(
    "▸ WS HANDSHAKE wss://rtc-clone",
  );
  // The percentage numeral is gone: the design's rail is bare.
  expect(screen.queryByTestId("boot-pct")).toBeNull();
});

test("SKIP renders as the design's bordered pill", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(false);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 0, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  const pill = screen.getByTestId("boot-skip");
  const style = Object.assign({}, ...[pill.props.style].flat(2));

  expect(screen.getByText("SKIP \u25B8")).toBeTruthy();
  expect(style.borderWidth).toBe(1);
  expect(style.borderRadius).toBe(6);
  expect(style.right).toBe(16);
  // 26px from the design plus the mocked bottom inset (34) — the prototype
  // has no home indicator to clear.
  expect(style.bottom).toBe(60);
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
  expect(screen.getByTestId("boot-log")).toBeTruthy();
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

test("motion enabled on an unported variant: emblem falls back, no canvas", async () => {
  // The boot rotation cycles all eight variants but only core/laser have Skia
  // scenes in 6a, so this is the majority runtime path today: a motion-enabled
  // boot landing on a scene-less variant must still show the static emblem.
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockUseBootMotionEnabled.mockReturnValue(true);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "docking", progress: 5, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
  expect(screen.queryByTestId("boot-canvas")).toBeNull();
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
