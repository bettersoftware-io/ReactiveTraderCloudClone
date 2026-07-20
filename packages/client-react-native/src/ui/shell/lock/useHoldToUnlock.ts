// packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts
import { useMemo, useRef } from "react";
import { Gesture, type LongPressGesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  type SharedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

/** Hold duration (ms) to complete the ring — wired to both the visual fill
 * and `LongPressGesture.minDuration`, so the sweep and the gesture's real
 * activation threshold always agree. */
export const HOLD_MS = 900;

/** Decay-back duration (ms) once a hold ends, whether released early or after
 * completing — always an eased animation, never an instant snap to 0. */
export const DECAY_MS = 260;

/**
 * Hold-to-unlock gesture: fills `progress` 0→1 over `HOLD_MS` while the ring
 * is held, calling `onComplete` exactly once when the hold activates (native
 * `minDuration`, not a per-frame callback). Releasing early — or after a
 * completed hold — decays `progress` back to 0 over `DECAY_MS`, never a snap.
 *
 * `onComplete` is read through a ref reassigned unconditionally on every
 * render (the `ExecutionCeremony` once-guard idiom, generalised here to "the
 * ref always mirrors the latest closure" rather than "detect a transition") —
 * the `gesture` object itself is memoised once (stable identity, so
 * `GestureDetector` isn't reconfigured on every keystroke of the password
 * field), but its handlers always call the *current* `onComplete` — the
 * caller's current typed password, in `LockScreen`'s case.
 *
 * Motion gating: this is an authentication control, not decoration, so it
 * must stay operable under reduced-motion/Freeze. When
 * `useShellMotionEnabled()` is off, the fill/decay become discrete jumps
 * (`progress.value` set straight to 1 or 0) instead of a `withTiming` sweep —
 * the hold-to-complete timing itself (native `minDuration`) is unaffected,
 * only the cosmetic ring sweep is skipped.
 *
 * The actual `progress.value` writes live in `fillProgress`/`decayProgress`
 * below — plain, non-hook functions, not inline arrows nested inside the
 * `useMemo` factory — so the mutation isn't lexically inside "render" scope;
 * only the *call* to a plain function is, which `react-hooks/immutability`
 * doesn't flag (mirrors this file's other ref-mutation idiom, which relies on
 * `react-hooks/refs` being off for RN — see `eslint.config.mjs`).
 *
 * No UI-side timers: timing is `react-native-gesture-handler`'s native
 * `minDuration` plus Reanimated's `withTiming`, not a JS-side interval.
 */
export function useHoldToUnlock({
  onComplete,
}: UseHoldToUnlockOptions): UseHoldToUnlockResult {
  const progress = useSharedValue(0);
  const motionEnabled = useShellMotionEnabled();

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const motionEnabledRef = useRef(motionEnabled);
  motionEnabledRef.current = motionEnabled;

  const fireComplete = useMemo(() => {
    return () => {
      onCompleteRef.current();
    };
  }, []);

  const gesture = useMemo(() => {
    return Gesture.LongPress()
      .minDuration(HOLD_MS)
      .onBegin(() => {
        fillProgress(progress, motionEnabledRef.current);
      })
      .onStart(() => {
        runOnJS(fireComplete)();
      })
      .onFinalize(() => {
        // Covers both an early release (never activated) and the reset after
        // a completed hold (activated, then the finger lifts) — either way
        // the ring returns to empty, ready for the next attempt.
        decayProgress(progress, motionEnabledRef.current);
      });
    // `progress` (a SharedValue) and `fireComplete` are both stable across
    // renders — this memo builds the gesture object exactly once.
  }, [progress, fireComplete]);

  return { gesture, progress };
}

export interface UseHoldToUnlockOptions {
  readonly onComplete: () => void;
}

export interface UseHoldToUnlockResult {
  readonly gesture: LongPressGesture;
  readonly progress: SharedValue<number>;
}

/** Starts (or discretely completes, under reduced motion) the fill. */
function fillProgress(
  progress: SharedValue<number>,
  motionEnabled: boolean,
): void {
  progress.value = motionEnabled
    ? withTiming(1, { duration: HOLD_MS, easing: Easing.linear })
    : 1;
}

/** Returns the ring to empty — eased under motion, an instant jump under
 * reduced motion, but never a bare snap-with-no-signal either way. */
function decayProgress(
  progress: SharedValue<number>,
  motionEnabled: boolean,
): void {
  progress.value = motionEnabled
    ? withTiming(0, { duration: DECAY_MS, easing: Easing.out(Easing.quad) })
    : 0;
}
