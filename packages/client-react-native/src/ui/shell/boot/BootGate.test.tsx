import { afterEach, expect, jest, test } from "@jest/globals";
import { screen, waitFor } from "@testing-library/react-native";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootGate } from "#/ui/shell/boot/BootGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const RUNNING = { variant: "core" as const, progress: 20, done: false };

afterEach(() => {
  jest.restoreAllMocks();
});

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

test("fades out then calls onFinished on the animated (non-reduce-motion) path", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);

  // BootSequence also renders BootEmblem, which drives its own cosmetic
  // Animated.timing pulse loop. Only the fade-out (toValue 0, 320ms) started
  // by BootGate.handleDone is under test here, so completions are keyed on
  // that specific config — the emblem's timing calls are left uncompleted
  // (their .start callback is simply never invoked).
  const completions: AnimationEndCallback[] = [];
  const timingSpy = jest
    .spyOn(Animated, "timing")
    .mockImplementation((_value, config) => {
      return {
        start: (cb?: AnimationEndCallback) => {
          if (config.toValue === 0 && config.duration === 320 && cb) {
            completions.push(cb);
          }
        },
        stop: () => {
          return undefined;
        },
        reset: () => {
          return undefined;
        },
      } as unknown as Animated.CompositeAnimation;
    });
  const onFinished = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce()}>
      <BootGate onFinished={onFinished} />
    </ViewModelProvider>,
  );
  await waitFor(() => {
    expect(completions).toHaveLength(1);
  });

  const fadeCall = timingSpy.mock.calls.find(([, config]) => {
    return config.toValue === 0 && config.duration === 320;
  });
  expect(fadeCall?.[1]).toMatchObject({
    toValue: 0,
    duration: 320,
    useNativeDriver: true,
  });
  // onFinished must NOT fire until the fade completes — this is the stuck-splash guard.
  expect(onFinished).not.toHaveBeenCalled();

  for (const cb of completions) {
    cb({ finished: true });
  }

  expect(onFinished).toHaveBeenCalledTimes(1);
});

test("still calls onFinished if the reduce-motion probe rejects (never strands the splash)", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockRejectedValue(new Error("probe failed"));
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

interface AnimationEndResult {
  finished: boolean;
}

type AnimationEndCallback = (result: AnimationEndResult) => void;
