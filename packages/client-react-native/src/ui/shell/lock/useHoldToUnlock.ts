// packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts
import { useContext, useEffect, useMemo, useRef } from "react";
import {
  type LongPressGesture,
  useLongPressGesture,
} from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  type SharedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { LockHoldProgressContext } from "#/ui/shell/lock/LockHoldProgressContext";

/** Hold duration (ms) to complete the ring — wired to both the visual fill
 * and the long-press gesture's `minDuration`, so the sweep and the gesture's real
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
 * the gesture keeps one native handler for the hook's lifetime (gesture-handler
 * 3's `useLongPressGesture` creates its handler tag once), and its callbacks
 * always call the *current* `onComplete` — the caller's current typed
 * password, in `LockScreen`'s case.
 *
 * Motion gating: this is an authentication control, not decoration, so it
 * must stay operable under reduced-motion/Freeze. When
 * `useShellMotionEnabled()` is off, the fill/decay become discrete jumps
 * instead of a `withTiming` sweep — the hold-to-complete timing itself
 * (native `minDuration`) is unaffected, only the cosmetic ring sweep is
 * skipped. The discrete fill jump lands on `onActivate` (hold ACTIVATION —
 * fires after the native `minDuration`, when a real unlock is imminent), not
 * `onBegin` (touch-down); the animated (motion-enabled) sweep still starts
 * on `onBegin` as before, since it's meant to visually track the whole
 * hold. The decay-to-0 jump stays on `onFinalize` either way.
 *
 * `motionEnabled` is threaded into the worklet through `motionEnabledShared`
 * — a `SharedValue<boolean>` kept in sync with the `useShellMotionEnabled()`
 * prop by the `useEffect` below — rather than a plain `useRef`. A `useRef`
 * object read inside a worklet callback is captured BY COPY when the worklet
 * is shipped to the UI thread — only a `SharedValue` stays live across the
 * JS/UI-thread boundary. A ref would freeze `motionEnabled` at whatever it
 * was when the gesture's callbacks last reached the UI thread, so a later
 * Freeze/OS reduced-motion toggle could miss a gesture already in place
 * (`LockScreen` returns `null` while unlocked and never unmounts).
 *
 * The actual `progress.value` writes live in `fillProgress`/
 * `completeProgressDiscrete`/`decayProgress` below — plain, non-hook
 * functions, not inline arrows nested inside the `useMemo` factory — so the
 * mutation isn't lexically inside "render" scope; only the *call* to a plain
 * function is, which `react-hooks/immutability` doesn't flag (mirrors this
 * file's other ref-mutation idiom, which relies on `react-hooks/refs` being
 * off for RN — see `eslint.config.mts`).
 *
 * No UI-side timers: timing is `react-native-gesture-handler`'s native
 * `minDuration` plus Reanimated's `withTiming`, not a JS-side interval.
 *
 * `progress` is the hook's own `SharedValue` unless a
 * `LockHoldProgressContext` pin is present (the visual harness only — see
 * that file), in which case the pinned value is what the ring reads AND what
 * the gesture writes; the hook's own value is still created (hooks are
 * unconditional) but simply unused.
 */
export function useHoldToUnlock({
  onComplete,
}: UseHoldToUnlockOptions): UseHoldToUnlockResult {
  const ownProgress = useSharedValue(0);
  const pinnedProgress = useContext(LockHoldProgressContext);
  const progress = pinnedProgress ?? ownProgress;
  const motionEnabled = useShellMotionEnabled();
  const motionEnabledShared = useSharedValue(motionEnabled);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    motionEnabledShared.value = motionEnabled;
  }, [motionEnabled, motionEnabledShared]);

  // This `useMemo` is NOT caching — it carries semantics the React Compiler
  // cannot supply, and this repo's memo ban does not apply to it. (See
  // `scripts/react-compiler-healthcheck.mts`, where this file is a documented
  // exclusion, not a tracked/expected-optimized entry.) The chain, measured
  // against `babel-plugin-react-compiler@1.0.0`:
  //
  // 1. Moving `onCompleteRef.current = onComplete` out of render and into a
  //    `useEffect` clears the obvious "ref write during render" bail, but a
  //    second one remains: `runOnJS(fireComplete)()` below closes over
  //    `onCompleteRef` (a `useRef`), and the compiler has no special case for
  //    `runOnJS` (it models `withTiming`/`withSpring`/`useSharedValue`/etc.
  //    from `react-native-reanimated`, but not `runOnJS` — confirmed by
  //    grepping the installed compiler bundle). It can't prove the gesture
  //    callback defers `fireComplete`'s execution, so it conservatively bails
  //    the whole hook.
  // 2. Dropping the ref entirely (reading `onComplete` directly in the
  //    worklet closure instead) DOES make this hook compile clean — measured,
  //    `OPTIMIZED`. But then the compiler's inferred memoization key for the
  //    callback becomes `onComplete` itself.
  // 3. `onComplete` is `submit`, declared inside `LockScreen`.
  // 4. `LockScreen` bails on the ViewModel seam (`useViewModel()`), so
  //    `submit` gets a new identity every render.
  //
  // So the ref indirection here isn't optional plumbing the compiler could
  // absorb: it's the only thing that keeps `fireComplete` stable while the
  // caller's callback churns for reasons this hook cannot fix.
  const fireComplete = useMemo(() => {
    return () => {
      onCompleteRef.current();
    };
  }, []);

  // The worklets Babel plugin turns each callback in a `use*Gesture` config
  // into a worklet, so these run on the UI thread, as gesture-handler 2's
  // `Gesture.LongPress()` builder callbacks did. The hook keeps one native
  // handler across renders and pushes a changed config to it, so the gesture
  // needs no memo of its own.
  const gesture = useLongPressGesture({
    minDuration: HOLD_MS,
    onBegin: () => {
      fillProgress(progress, motionEnabledShared.value);
    },
    onActivate: () => {
      completeProgressDiscrete(progress, motionEnabledShared.value);
      runOnJS(fireComplete)();
    },
    onFinalize: () => {
      // Covers both an early release (never activated) and the reset after
      // a completed hold (activated, then the finger lifts) — either way
      // the ring returns to empty, ready for the next attempt.
      decayProgress(progress, motionEnabledShared.value);
    },
  });

  return { gesture, progress };
}

export interface UseHoldToUnlockOptions {
  readonly onComplete: () => void;
}

export interface UseHoldToUnlockResult {
  readonly gesture: LongPressGesture;
  readonly progress: SharedValue<number>;
}

/** Starts the animated fill on touch-down. Under reduced motion this is a
 * no-op — the discrete jump instead lands on hold-activation, via
 * `completeProgressDiscrete` below. */
function fillProgress(
  progress: SharedValue<number>,
  motionEnabled: boolean,
): void {
  if (!motionEnabled) {
    return;
  }

  progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
}

/** Under reduced motion, jumps the ring straight to full on hold-activation
 * (`onActivate`, after the native `minDuration`) — matching when a real unlock
 * is imminent, rather than at touch-down. No-op when motion is enabled (the
 * animated sweep started in `fillProgress` already carries the ring there). */
function completeProgressDiscrete(
  progress: SharedValue<number>,
  motionEnabled: boolean,
): void {
  if (motionEnabled) {
    return;
  }

  progress.value = 1;
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
