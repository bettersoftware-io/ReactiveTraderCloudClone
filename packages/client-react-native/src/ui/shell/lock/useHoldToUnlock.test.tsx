import { beforeEach, expect, jest, test } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";

import type { UseHoldToUnlockOptions } from "#/ui/shell/lock/useHoldToUnlock";

const { useHoldToUnlock, HOLD_MS, DECAY_MS } =
  require("./useHoldToUnlock") as typeof import("./useHoldToUnlock");

beforeEach(() => {
  jest.clearAllMocks();
  mockMotionEnabled.mockReturnValue(true);
});

test("holding rises progress toward 1 via a timed fill", async () => {
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const { result } = await renderHook(() => {
    return useHoldToUnlock({ onComplete });
  });

  expect(result.current.progress.value).toBe(0);

  result.current.gesture.handlers.onBegin?.(fakeEvent());

  expect(result.current.progress.value).toBe(1);
  expect(withTimingSpy).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: HOLD_MS }),
  );
});

test("releasing early decays progress back to 0 via a timed animation, not a snap", async () => {
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const { result } = await renderHook(() => {
    return useHoldToUnlock({ onComplete });
  });

  result.current.gesture.handlers.onBegin?.(fakeEvent());
  withTimingSpy.mockClear();

  result.current.gesture.handlers.onFinalize?.(fakeEvent(), false);

  expect(withTimingSpy).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: DECAY_MS }),
  );
  expect(result.current.progress.value).toBe(0);
  expect(onComplete).not.toHaveBeenCalled();
});

test("onComplete fires exactly once on activation, not per frame", async () => {
  const onComplete = jest.fn();
  const { result } = await renderHook(() => {
    return useHoldToUnlock({ onComplete });
  });

  result.current.gesture.handlers.onBegin?.(fakeEvent());
  result.current.gesture.handlers.onStart?.(fakeEvent());
  expect(onComplete).toHaveBeenCalledTimes(1);

  // A completed hold still finalizes (finger lifts after activation) — must
  // not re-fire onComplete.
  result.current.gesture.handlers.onFinalize?.(fakeEvent(), true);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("completion invokes the latest onComplete closure across re-renders (re-arms)", async () => {
  const first = jest.fn();
  const second = jest.fn();
  const { result, rerender } = await renderHook(
    (props: UseHoldToUnlockOptions) => {
      return useHoldToUnlock(props);
    },
    { initialProps: { onComplete: first } },
  );

  await rerender({ onComplete: second });
  result.current.gesture.handlers.onStart?.(fakeEvent());

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test("with motion disabled, the discrete fill jump lands on hold-activation (onStart), not touch-down (onBegin)", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const { result } = await renderHook(() => {
    return useHoldToUnlock({ onComplete });
  });

  result.current.gesture.handlers.onBegin?.(fakeEvent());
  // Touch-down alone must NOT jump the ring full — a real unlock isn't
  // imminent until the hold actually activates (native minDuration).
  expect(result.current.progress.value).toBe(0);
  expect(withTimingSpy).not.toHaveBeenCalled();

  result.current.gesture.handlers.onStart?.(fakeEvent());
  expect(result.current.progress.value).toBe(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(withTimingSpy).not.toHaveBeenCalled();

  result.current.gesture.handlers.onFinalize?.(fakeEvent(), true);
  expect(result.current.progress.value).toBe(0);
  expect(withTimingSpy).not.toHaveBeenCalled();
});

test("motionEnabled is threaded into a live SharedValue that reflects a later prop change, not frozen at boot", async () => {
  // The real bug this guards: `LockScreen` never unmounts, so `gesture` (and
  // its worklet closures) is built once at boot. A `useRef` read inside a
  // worklet callback is captured BY COPY at worklet-build time on the real
  // UI thread — only a SharedValue stays live across the JS/UI-thread
  // boundary. This official reanimated jest mock replaces worklets with
  // synchronous plain JS (no thread boundary at all, and — see its source —
  // `useSharedValue` doesn't persist a stable instance across renders the
  // way the real hook does), so driving the gesture handlers after a
  // rerender can't distinguish a frozen ref from a live SharedValue here:
  // both "work" under the mock. This test instead observes the SharedValue
  // `useHoldToUnlock`'s own sync effect writes to, proving the effect
  // actually runs and carries the current prop value (as opposed to a
  // missing/no-op effect, which this WOULD catch).
  mockMotionEnabled.mockReturnValue(true);
  const useSharedValueSpy = jest.spyOn(Reanimated, "useSharedValue");
  const { rerender } = await renderHook(() => {
    return useHoldToUnlock({ onComplete: jest.fn() });
  });

  expect(latestMotionEnabledSharedValue(useSharedValueSpy)).toBe(true);

  mockMotionEnabled.mockReturnValue(false);
  await rerender({ onComplete: jest.fn() });

  expect(latestMotionEnabledSharedValue(useSharedValueSpy)).toBe(false);
});

// Handlers only need a value to pass through; none of the assertions above
// read event fields, so an empty stand-in satisfies the (event, success?)
// signatures without pulling in gesture-handler's payload types.
function fakeEvent(): never {
  return {} as never;
}

// `useHoldToUnlock` calls `useSharedValue` twice per render — once for
// `progress` (a number) and once for `motionEnabledShared` (a boolean).
// Filtering on the boolean-typed call picks out the latter regardless of how
// many renders have accumulated calls on the spy, without assuming a fixed
// call index.
function latestMotionEnabledSharedValue(
  spy: jest.SpiedFunction<typeof Reanimated.useSharedValue>,
): boolean {
  const index = spy.mock.calls.findLastIndex((args) => {
    return typeof args[0] === "boolean";
  });
  const shared = spy.mock.results[index]?.value as { value: boolean };

  return shared.value;
}

const mockMotionEnabled = jest.fn<() => boolean>();

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled();
    },
  };
});
