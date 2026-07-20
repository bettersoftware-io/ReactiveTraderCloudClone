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

test("with motion disabled, holding still completes and submits, jumping discretely instead of sweeping", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const { result } = await renderHook(() => {
    return useHoldToUnlock({ onComplete });
  });

  result.current.gesture.handlers.onBegin?.(fakeEvent());
  expect(result.current.progress.value).toBe(1);
  expect(withTimingSpy).not.toHaveBeenCalled();

  result.current.gesture.handlers.onStart?.(fakeEvent());
  expect(onComplete).toHaveBeenCalledTimes(1);

  result.current.gesture.handlers.onFinalize?.(fakeEvent(), true);
  expect(result.current.progress.value).toBe(0);
  expect(withTimingSpy).not.toHaveBeenCalled();
});

// Handlers only need a value to pass through; none of the assertions above
// read event fields, so an empty stand-in satisfies the (event, success?)
// signatures without pulling in gesture-handler's payload types.
function fakeEvent(): never {
  return {} as never;
}

const mockMotionEnabled = jest.fn<() => boolean>();

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled();
    },
  };
});
