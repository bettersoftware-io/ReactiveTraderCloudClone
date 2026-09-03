import { beforeEach, expect, jest, test } from "@jest/globals";
import type { SharedValue } from "react-native-reanimated";
import * as Reanimated from "react-native-reanimated";

import { DECAY_MS, HOLD_MS } from "#/ui/shell/lock/useHoldToUnlock";
import { useHoldToUnlockPage } from "#tests/pages/UseHoldToUnlockPage";

const mockMotionEnabled = jest.fn<() => boolean>();

beforeEach(() => {
  jest.clearAllMocks();
  mockMotionEnabled.mockReturnValue(true);
});

test("holding rises progress toward 1 via a timed fill", async () => {
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete });

  expect(page.state.progress.value).toBe(0);

  page.state.gesture.handlers.onBegin?.(fakeEvent());

  expect(page.state.progress.value).toBe(1);
  expect(withTimingSpy).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: HOLD_MS }),
  );
});

test("a LockHoldProgressContext pin is the progress the ring reads and the gesture writes", async () => {
  const pinned = { value: 0.55 } as SharedValue<number>;
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete: jest.fn() }, pinned);

  expect(page.state.progress).toBe(pinned);

  page.state.gesture.handlers.onBegin?.(fakeEvent());

  expect(pinned.value).toBe(1);
});

test("releasing early decays progress back to 0 via a timed animation, not a snap", async () => {
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete });

  page.state.gesture.handlers.onBegin?.(fakeEvent());
  withTimingSpy.mockClear();

  page.state.gesture.handlers.onFinalize?.(fakeEvent(), false);

  expect(withTimingSpy).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: DECAY_MS }),
  );
  expect(page.state.progress.value).toBe(0);
  expect(onComplete).not.toHaveBeenCalled();
});

test("onComplete fires exactly once on activation, not per frame", async () => {
  const onComplete = jest.fn();
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete });

  page.state.gesture.handlers.onBegin?.(fakeEvent());
  page.state.gesture.handlers.onStart?.(fakeEvent());
  expect(onComplete).toHaveBeenCalledTimes(1);

  // A completed hold still finalizes (finger lifts after activation) — must
  // not re-fire onComplete.
  page.state.gesture.handlers.onFinalize?.(fakeEvent(), true);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("completion invokes the latest onComplete closure across re-renders (re-arms)", async () => {
  const first = jest.fn();
  const second = jest.fn();
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete: first });

  await page.rerender({ onComplete: second });
  page.state.gesture.handlers.onStart?.(fakeEvent());

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test("with motion disabled, the discrete fill jump lands on hold-activation (onStart), not touch-down (onBegin)", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withTimingSpy = jest.spyOn(Reanimated, "withTiming");
  const onComplete = jest.fn();
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete });

  page.state.gesture.handlers.onBegin?.(fakeEvent());
  // Touch-down alone must NOT jump the ring full — a real unlock isn't
  // imminent until the hold actually activates (native minDuration).
  expect(page.state.progress.value).toBe(0);
  expect(withTimingSpy).not.toHaveBeenCalled();

  page.state.gesture.handlers.onStart?.(fakeEvent());
  expect(page.state.progress.value).toBe(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(withTimingSpy).not.toHaveBeenCalled();

  page.state.gesture.handlers.onFinalize?.(fakeEvent(), true);
  expect(page.state.progress.value).toBe(0);
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
  const page = useHoldToUnlockPage();
  await page.mount({ onComplete: jest.fn() });

  expect(latestMotionEnabledSharedValue(useSharedValueSpy)).toBe(true);

  mockMotionEnabled.mockReturnValue(false);
  await page.rerender({ onComplete: jest.fn() });

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
  const shared = spy.mock.results[index]?.value as SharedValue<boolean>;

  return shared.value;
}

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled();
    },
  };
});
