import { useLayoutEffect, useRef } from "react";

/**
 * FLIP (First-Last-Invert-Play) glide for a keyed grid. Consumers register
 * each item's root element via `register(key)`; whenever any of `deps`
 * changes, moved items animate from their previous screen position to the
 * new one instead of jump-cutting. Uses the raw WAAPI (`Element.animate`),
 * not the `animateOnce` Motion One wrapper — FLIP fires per-item on every
 * layout, so a short-lived native animation avoids spinning up the Motion One
 * engine per grid item.
 *
 * No-ops (skips measuring/animating) when the browser/OS prefers reduced
 * motion — the same `matchMedia("(prefers-reduced-motion: reduce)")` seam
 * BootGate/BootSequence already consult.
 */
export function useFlipGrid(deps: unknown[]): FlipGridApi {
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, Rect>());

  useLayoutEffect(() => {
    const elements = elementsRef.current;
    const nextPositions = new Map<string, Rect>();
    elements.forEach((el, key) => {
      const rect = el.getBoundingClientRect();
      nextPositions.set(key, { left: rect.left, top: rect.top });
    });

    const prevPositions = positionsRef.current;

    if (prevPositions.size > 0 && !prefersReducedMotion()) {
      for (const { key, dx, dy } of flipDeltas(prevPositions, nextPositions)) {
        const el = elements.get(key);
        if (el) playFlip(el, dx, dy);
      }
    }

    positionsRef.current = nextPositions;
    // deps is an opaque caller-supplied dependency list (the whole point of
    // this hook is to run the FLIP measure/animate pass whenever it changes).
    // Spread into a literal array so Biome's exhaustive-deps rule recognizes
    // it as a dependency list; ESLint's equivalent still can't verify a
    // spread's contents statically, which is expected here.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is intentionally caller-supplied, not statically enumerable
  }, [...deps]);

  function register(key: string): (el: HTMLElement | null) => void {
    return (el: HTMLElement | null): void => {
      if (el) {
        elementsRef.current.set(key, el);
      } else {
        elementsRef.current.delete(key);
      }
    };
  }

  return { register };
}

/** Pure invert-phase math: for each key present in both position maps, the
 *  delta needed to animate FROM the previous position TO the next one. Keys
 *  that didn't move, or that exist in only one of the two maps (added/
 *  removed by the filter), are omitted. */
export function flipDeltas(
  prev: ReadonlyMap<string, Rect>,
  next: ReadonlyMap<string, Rect>,
): FlipDelta[] {
  const deltas: FlipDelta[] = [];
  next.forEach((nextRect, key) => {
    const prevRect = prev.get(key);
    if (!prevRect) return;
    const dx = prevRect.left - nextRect.left;
    const dy = prevRect.top - nextRect.top;
    if (dx === 0 && dy === 0) return;
    deltas.push({ key, dx, dy });
  });
  return deltas;
}

function playFlip(el: HTMLElement, dx: number, dy: number): void {
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

export interface Rect {
  left: number;
  top: number;
}

export interface FlipDelta {
  key: string;
  dx: number;
  dy: number;
}

export interface FlipGridApi {
  register: (key: string) => (el: HTMLElement | null) => void;
}

const FLIP_DURATION_MS = 340;
const FLIP_EASING = "cubic-bezier(.2,.8,.2,1)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
