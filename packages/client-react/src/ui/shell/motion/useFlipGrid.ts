import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * FLIP (First-Last-Invert-Play) glide for a keyed grid. Consumers register
 * each item's root element via `register(key)`; whenever any of `deps`
 * changes, moved items animate from their previous screen position to the
 * new one instead of jump-cutting. Geometry changes that arrive between
 * deps changes (window resize, dock panels dragged/resized) refresh the
 * stored origins without animating. Uses the raw WAAPI (`Element.animate`),
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
  const observerRef = useRef<ResizeObserver | null>(null);

  // The deps-change effect below is the only writer that ANIMATES; everything
  // else that moves the grid (window resize, a dock panel being dragged or
  // resized — both change tile sizes, which ResizeObserver sees) just
  // refreshes the stored origins so the NEXT deps-change FLIP doesn't glide
  // in from a stale position.
  useEffect(() => {
    function resnapshot(): void {
      // getBoundingClientRect includes in-flight WAAPI transforms, so a
      // refresh that lands mid-glide would store a transformed rect as the
      // next FLIP's origin (reads as a snap/jump-cut). Skip the refresh
      // while any glide is still running — the deps-change effect re-measures
      // from scratch anyway, so a skipped refresh self-heals on the next FLIP.
      if (anyGlideRunning(elementsRef.current)) return;
      positionsRef.current = measurePositions(elementsRef.current);
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resnapshot);
    observerRef.current = observer;
    elementsRef.current.forEach((el) => {
      observer?.observe(el);
    });
    window.addEventListener("resize", resnapshot);

    return (): void => {
      window.removeEventListener("resize", resnapshot);
      observer?.disconnect();
      observerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const nextPositions = measurePositions(elementsRef.current);
    const prevPositions = positionsRef.current;

    if (prevPositions.size > 0 && !prefersReducedMotion()) {
      for (const { key, dx, dy } of flipDeltas(prevPositions, nextPositions)) {
        const el = elementsRef.current.get(key);
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
        observerRef.current?.observe(el);
      } else {
        const prev = elementsRef.current.get(key);
        if (prev) observerRef.current?.unobserve(prev);
        elementsRef.current.delete(key);
      }
    };
  }

  return { register };
}

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
    if (!prevRect) return;
    const dx = prevRect.left - nextRect.left;
    const dy = prevRect.top - nextRect.top;
    if (Math.abs(dx) < FLIP_MIN_DELTA_PX && Math.abs(dy) < FLIP_MIN_DELTA_PX)
      return;
    deltas.push({ key, dx, dy });
  });
  return deltas;
}

/** True while any registered element still has a running animation. The
 *  registered elements are the bare grid slots, so the only animations on
 *  them are this hook's own WAAPI glides (CSS animations — tick flashes,
 *  bookPulse — live on their descendants and don't false-positive here).
 *  Guarded optional: jsdom elements have no getAnimations. */
function anyGlideRunning(elements: ReadonlyMap<string, HTMLElement>): boolean {
  let running = false;
  elements.forEach((el) => {
    if (el.getAnimations && el.getAnimations().length > 0) running = true;
  });
  return running;
}

/** Snapshot each registered element's current viewport position. */
function measurePositions(
  elements: ReadonlyMap<string, HTMLElement>,
): Map<string, Rect> {
  const positions = new Map<string, Rect>();
  elements.forEach((el, key) => {
    const rect = el.getBoundingClientRect();
    positions.set(key, { left: rect.left, top: rect.top });
  });
  return positions;
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

// PROTO motion/useFlip.ts DEFAULT_DUR_MS / FLIP_EASING — one global glide.
const FLIP_DURATION_MS = 440;
const FLIP_EASING = "cubic-bezier(.22,.85,.3,1)";
// PROTO useFlip.ts sub-pixel suppression threshold.
const FLIP_MIN_DELTA_PX = 0.5;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
