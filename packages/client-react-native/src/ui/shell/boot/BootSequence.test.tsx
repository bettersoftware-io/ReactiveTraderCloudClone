import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders wordmark, variant tag and progress percent", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
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
