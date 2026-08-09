import { afterEach, expect, jest, test } from "@jest/globals";
import { act, screen, waitFor } from "@testing-library/react-native";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";

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
      <BootGate />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
});

test("dismisses through the seam after the machine reports done (reduce-motion jump-cut)", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  const dismiss = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce(dismiss)}>
      <BootGate />
    </ViewModelProvider>,
  );
  await waitFor(() => {
    expect(dismiss).toHaveBeenCalled();
  });
});

test("fades out then dismisses on the animated (non-reduce-motion) path", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);

  // BootSequence also renders BootEmblem, which drives its own cosmetic
  // Animated.timing pulse loop. Only the fade-out (toValue 0, 320ms) started
  // by BootGate.dismissBoot is under test here, so completions are keyed on
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
  const dismiss = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce(dismiss)}>
      <BootGate />
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
  // dismiss must NOT fire until the fade completes — this is the stuck-splash guard.
  expect(dismiss).not.toHaveBeenCalled();

  for (const cb of completions) {
    cb({ finished: true });
  }

  expect(dismiss).toHaveBeenCalledTimes(1);
});

test("still dismisses if the reduce-motion probe rejects (never strands the splash)", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockRejectedValue(new Error("probe failed"));
  const dismiss = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce(dismiss)}>
      <BootGate />
    </ViewModelProvider>,
  );
  await waitFor(() => {
    expect(dismiss).toHaveBeenCalled();
  });
});

test("renders nothing while the seam reports the splash hidden", async () => {
  // The replay contract, and the regression guard for the defect this file
  // could not previously see: visibility used to be a `bootDone` useState in
  // `app/(app)/_layout.tsx`, so `reboot()` re-raised `BootGatePresenter` and
  // NOTHING re-rendered the splash — ⟳ Replay Boot was a silent no-op on RN
  // while every test here passed. Reading `visible` off the seam is what makes
  // replay work, so both readings of it are asserted: hidden renders nothing,
  // and the tests above cover visible rendering the splash.
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeRunning(false)}>
      <BootGate />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("boot-gate")).toBeNull();
  expect(screen.queryByTestId("boot-wordmark")).toBeNull();
});

// NO jest test guards the replay defect, deliberately — and this is the record
// of why, so nobody re-adds one that cannot fail.
//
// The defect: `BootGate` never unmounts (the layout renders it
// unconditionally), so an opacity `Animated.Value` held on IT survives every
// raise, carrying the previous dismissal's terminal 0 into the next boot. The
// splash then ran its whole ~5s ramp at native opacity 0 — invisible over the
// live HUD — and appeared for one frame at the end, when starting the next fade
// re-synced the native node. Measured on the simulator: 31 consecutive frames
// with no splash, then a single partial-opacity frame with progress already at
// 100%.
//
// Why there is no test. The previous fix re-armed the shared value with
// `opacity.setValue(1)`, and the test here asserted that CALL. It passed for as
// long as the bug shipped, because under `useNativeDriver: true` the JS-side
// value is not what paints. Two later attempts were tried and both were
// verified worthless before being discarded:
//   1. counting `Animated.Value` constructions — `useRef(new Animated.Value(1))`
//      evaluates its argument on EVERY render, so it counts renders, not
//      retained instances; it stayed green with the defect restored.
//   2. reading the value off the rendered node — RN resolves it to a plain
//      number on the host (`style.opacity === 1`), so the instance identity that
//      distinguishes fresh from stale never reaches the tree.
// The fix is structural rather than behavioural (the value now mounts and dies
// WITH the splash, as both web clients' CSS opacity already does), and this tier
// cannot see structure. The simulator is the witness; see docs/rn-open-items.md.

// Never-done fake: useBootSequence returns a running state and never invokes
// onDone — the splash stays up so we can assert it rendered.
function noop(): undefined {
  return undefined;
}

function fakeRunning(visible = true, dismiss: () => void = noop): ViewModel {
  return {
    useBootGate: () => {
      return { visible, dismiss, reboot: noop };
    },
    useBootSequence: (_onDone: () => void) => {
      return {
        state: RUNNING,
        skip: noop,
      };
    },
  } as unknown as ViewModel;
}

// Done-once fake: invokes onDone exactly once after mount, mirroring the machine
// firing its onDone when the ramp completes.
function fakeDoneOnce(dismiss: () => void): ViewModel {
  return {
    useBootGate: () => {
      return { visible: true, dismiss, reboot: noop };
    },
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
        skip: noop,
      };
    },
  } as unknown as ViewModel;
}

interface AnimationEndResult {
  finished: boolean;
}

type AnimationEndCallback = (result: AnimationEndResult) => void;

// BootGate mounts BootSequence with a bare-bones fake ViewModel that only
// stubs `useBootSequence` — it predates Task 8's `useBootMotionEnabled` call
// inside BootSequence/BootCanvas, which pulls `usePowerSaver` /
// `useForceBootAnimation` off the real ViewModel and would throw against
// these fakes. Mocking the hook to `false` keeps every test above on its
// original static-splash path (BootEmblem renders, no Skia canvas) — motion
// gating itself is BootCanvas's/BootSequence's own concern, already covered
// by BootCanvas.test.tsx and BootSequence.test.tsx.
jest.mock("#/ui/shell/boot/useBootMotionEnabled", () => {
  return {
    useBootMotionEnabled: () => {
      return false;
    },
  };
});
