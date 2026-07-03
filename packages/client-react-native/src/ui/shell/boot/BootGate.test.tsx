import { expect, jest, test } from "@jest/globals";
import { screen, waitFor } from "@testing-library/react-native";
import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootGate } from "#/ui/shell/boot/BootGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const RUNNING = { variant: "core" as const, progress: 20, done: false };

test("renders the boot splash while the machine is running", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeRunning()}>
      <BootGate onFinished={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
});

test("calls onFinished after the machine reports done (reduce-motion jump-cut)", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  const onFinished = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce()}>
      <BootGate onFinished={onFinished} />
    </ViewModelProvider>,
  );
  await waitFor(() => {
    expect(onFinished).toHaveBeenCalled();
  });
});

// Never-done fake: useBootSequence returns a running state and never invokes
// onDone — the splash stays up so we can assert it rendered.
function fakeRunning(): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return {
        state: RUNNING,
        skip: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

// Done-once fake: invokes onDone exactly once after mount, mirroring the machine
// firing its onDone when the ramp completes.
function fakeDoneOnce(): ViewModel {
  return {
    useBootSequence: (onDone: () => void) => {
      const fired = useRef(false);
      useEffect(() => {
        if (!fired.current) {
          fired.current = true;
          onDone();
        }
      }, [onDone]);
      return {
        state: { variant: "core" as const, progress: 100, done: true },
        skip: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}
