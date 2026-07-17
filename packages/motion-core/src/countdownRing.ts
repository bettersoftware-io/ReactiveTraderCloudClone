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

export function ringCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

export function ringDashOffset(
  radius: number,
  remainingFraction: number,
): number {
  return ringCircumference(radius) * (1 - remainingFraction);
}
