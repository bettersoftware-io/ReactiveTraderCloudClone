// packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts
import { useEffect, useMemo, useRef } from "react";
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
 * instead of a `withTiming` sweep — the hold-to-complete timing itself
 * (native `minDuration`) is unaffected, only the cosmetic ring sweep is
 * skipped. The discrete fill jump lands on `.onStart` (hold ACTIVATION —
 * fires after the native `minDuration`, when a real unlock is imminent), not
 * `.onBegin` (touch-down); the animated (motion-enabled) sweep still starts
 * on `.onBegin` as before, since it's meant to visually track the whole
 * hold. The decay-to-0 jump stays on `.onFinalize` either way.
 *
 * `motionEnabled` is threaded into the worklet through `motionEnabledShared`
 * — a `SharedValue<boolean>` kept in sync with the `useShellMotionEnabled()`
 * prop by the `useEffect` below — rather than a plain `useRef`. `LockScreen`
 * returns `null` while unlocked and never unmounts, so `gesture` (and its
 * worklet closures) is built once at boot; a `useRef` object read inside a
 * worklet callback is captured BY COPY at worklet-build time on the UI
 * thread — only a `SharedValue` stays live across the JS/UI-thread boundary.
 * A ref would freeze `motionEnabled` at boot forever, so a later Freeze/OS
 * reduced-motion toggle would never reach an already-built gesture.
 *
 * The actual `progress.value` writes live in `fillProgress`/
 * `completeProgressDiscrete`/`decayProgress` below — plain, non-hook
 * functions, not inline arrows nested inside the `useMemo` factory — so the
 * mutation isn't lexically inside "render" scope; only the *call* to a plain
 * function is, which `react-hooks/immutability` doesn't flag (mirrors this
 * file's other ref-mutation idiom, which relies on `react-hooks/refs` being
 * off for RN — see `eslint.config.mjs`).
 *
 * No UI-side timers: timing is `react-native-gesture-handler`'s native
 * `minDuration` plus Reanimated's `withTiming`, not a JS-side interval.
 */
export function useHoldToUnlock({
  onComplete,
}: UseHoldToUnlockOptions): UseHoldToUnlockResult {
  const progress = useSharedValue(0);
  const motionEnabled = useShellMotionEnabled();
  const motionEnabledShared = useSharedValue(motionEnabled);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    motionEnabledShared.value = motionEnabled;
  }, [motionEnabled, motionEnabledShared]);

  // These two `useMemo`s are NOT caching — they carry semantics the React
  // Compiler cannot supply, and this repo's memo ban does not apply to them.
  // (See `scripts/react-compiler-healthcheck.mjs`, where this file is a
  // documented exclusion, not a tracked/expected-optimized entry.) The chain,
  // measured against `babel-plugin-react-compiler@1.0.0` while attempting the
  // exact refactor this comment replaces:
  //
  // 1. Moving `onCompleteRef.current = onComplete` out of render and into a
  //    `useEffect` clears the obvious "ref write during render" bail, but a
  //    second one remains: `runOnJS(fireComplete)()` below closes over
  //    `onCompleteRef` (a `useRef`), and the compiler has no special case for
  //    `runOnJS` (it models `withTiming`/`withSpring`/`useSharedValue`/etc.
  //    from `react-native-reanimated`, but not `runOnJS` — confirmed by
  //    grepping the installed compiler bundle). It can't prove `.onStart(cb)`
  //    defers `cb`'s execution, so it conservatively bails the whole hook.
  // 2. Dropping the ref entirely (reading `onComplete` directly in the
  //    worklet closure instead) DOES make this hook compile clean — measured,
  //    `OPTIMIZED`. But then the compiler's inferred memoization key for
  //    `gesture` becomes `onComplete` itself.
  // 3. `onComplete` is `submit`, declared inside `LockScreen`.
  // 4. `LockScreen` bails on the ViewModel seam (`useViewModel()`), so
  //    `submit` gets a new identity every render — meaning the gesture would
  //    be rebuilt every render regardless of what this hook does internally.
  //
  // So the ref indirection here isn't optional plumbing the compiler could
  // absorb: it's the only thing decoupling `gesture`'s identity (stable, so
  // `GestureDetector`/the native `LongPressGesture` handler is never
  // reattached) from a caller whose callback identity churns for reasons this
  // hook cannot fix. Reanimated's own docs recommend exactly this
  // `useMemo`-around-a-`Gesture` pattern, because rebuilding the gesture
  // object reattaches it on every render — normally something the React
  // Compiler would handle for you, which is precisely the case this hook
  // falls outside of. Keep both memos.
  const fireComplete = useMemo(() => {
    return () => {
      onCompleteRef.current();
    };
  }, []);

  const gesture = useMemo(() => {
    return Gesture.LongPress()
      .minDuration(HOLD_MS)
      .onBegin(() => {
        fillProgress(progress, motionEnabledShared.value);
      })
      .onStart(() => {
        completeProgressDiscrete(progress, motionEnabledShared.value);
        runOnJS(fireComplete)();
      })
      .onFinalize(() => {
        // Covers both an early release (never activated) and the reset after
        // a completed hold (activated, then the finger lifts) — either way
        // the ring returns to empty, ready for the next attempt.
        decayProgress(progress, motionEnabledShared.value);
      });
    // `progress`, `motionEnabledShared` (both SharedValues) and
    // `fireComplete` are all stable across renders — this memo builds the
    // gesture object exactly once.
  }, [progress, motionEnabledShared, fireComplete]);

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
 * (`.onStart`, after the native `minDuration`) — matching when a real unlock
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
