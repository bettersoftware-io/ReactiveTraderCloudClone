export interface Rect {
  left: number;
  top: number;
  /** Only read by exit ghosts; flipDeltas ignores them. */
  width: number;
  height: number;
}

export interface FlipDelta {
  key: string;
  dx: number;
  dy: number;
}

// PROTO motion/useFlip.ts DEFAULT_DUR_MS / FLIP_EASING — one global glide.
export const FLIP_DURATION_MS = 440;
export const FLIP_EASING = "cubic-bezier(.22,.85,.3,1)";
// PROTO cardOut: .34s cubic-bezier(.4,0,.7,1).
export const EXIT_DURATION_MS = 340;
export const EXIT_EASING = "cubic-bezier(.4,0,.7,1)";
// Fallback travel distance when no [data-flip-stage] ancestor is found to
// measure the real panel borders against.
export const DRIFT_PX = 32;
// PROTO useFlip.ts sub-pixel suppression threshold.
const FLIP_MIN_DELTA_PX = 0.5;

/** Pure invert-phase math: for each key present in both position maps, the
 *  delta needed to animate FROM the previous position TO the next one. Keys
 *  that didn't move (within the sub-pixel threshold — PROTO useFlip.ts
 *  suppresses glides under ~0.5px so a re-render that barely nudges a node
 *  doesn't flicker), or that exist in only one of the two maps (added/
 *  removed by the filter), are omitted. */
export function flipDeltas(
  prev: ReadonlyMap<string, Rect>,
  next: ReadonlyMap<string, Rect>,
): FlipDelta[] {
  const deltas: FlipDelta[] = [];
  next.forEach((nextRect, key) => {
    const prevRect = prev.get(key);

    if (!prevRect) {
      return;
    }

    const dx = prevRect.left - nextRect.left;
    const dy = prevRect.top - nextRect.top;

    if (Math.abs(dx) < FLIP_MIN_DELTA_PX && Math.abs(dy) < FLIP_MIN_DELTA_PX) {
      return;
    }

    deltas.push({ key, dx, dy });
  });
  return deltas;
}
