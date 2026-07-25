export const COUNTDOWN_URGENT_FRACTION = 0.25;

export function countdownProgress(
  remainingMs: number,
  totalMs: number,
): number {
  if (totalMs <= 0) {
    return 0;
  }

  const frac = remainingMs / totalMs;

  if (frac <= 0) {
    return 0;
  }

  if (frac >= 1) {
    return 1;
  }

  return frac;
}

// `ringCircumference`/`ringDashOffset` carry the `"worklet"` directive (like
// `project3d`) because RN's `useAnimatedProps` calls `ringDashOffset` inside a
// UI-thread worklet (`HoldToUnlockRing`), and a worklet may only synchronously
// call callees that are themselves worklets — otherwise the callee is a "remote
// function" on the JS thread and the call throws on-device (jest can't catch
// this: its Reanimated mock runs the worklet as plain JS with full module
// scope). `ringDashOffset` calls `ringCircumference`, so BOTH must be marked.
// The directive is an inert string literal off-RN (web/Solid have no worklet
// plugin), so those consumers — and this function's JS-thread callers — are
// unaffected.
export function ringCircumference(radius: number): number {
  "worklet";
  return 2 * Math.PI * radius;
}

export function ringDashOffset(
  radius: number,
  remainingFraction: number,
): number {
  "worklet";
  return ringCircumference(radius) * (1 - remainingFraction);
}
