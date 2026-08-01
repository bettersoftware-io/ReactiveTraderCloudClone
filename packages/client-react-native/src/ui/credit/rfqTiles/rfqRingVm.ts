import { ringDashOffset } from "@rtc/motion-core";

/** Ring radius, from the prototype's `circle r="13"` (dc.html:231). Its
 * `stroke-dasharray: 81.7` is 2π×13 — i.e. `ringCircumference(13)`, which is
 * why that literal never appears in our code. */
export const RFQ_RING_RADIUS = 13;

/** The prototype flips the ring to the negative accent under ten seconds. */
export const RFQ_RING_URGENT_MS = 10_000;

export interface RfqRingVm {
  readonly dashOffset: number;
  readonly isUrgent: boolean;
}

/** Remaining/total milliseconds → the two things the ring draws: how far round
 * the stroke has retreated, and whether it wears the urgent tint. Geometry is
 * `@rtc/motion-core`'s, shared verbatim with the lock ring — this file owns the
 * RFQ-specific radius and threshold, nothing more. */
export function rfqRingVm(remainingMs: number, totalMs: number): RfqRingVm {
  // A zero/negative total would divide by zero; treat it as a one-tick window
  // so the clamp below lands on "expired" instead of NaN.
  const safeTotal = totalMs > 0 ? totalMs : 1;
  const clamped = Math.max(0, Math.min(remainingMs, safeTotal));

  return {
    dashOffset: ringDashOffset(RFQ_RING_RADIUS, clamped / safeTotal),
    isUrgent: clamped < RFQ_RING_URGENT_MS,
  };
}
