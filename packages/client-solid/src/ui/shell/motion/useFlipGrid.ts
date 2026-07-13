import { createEffect, on, onCleanup, onMount } from "solid-js";

import {
  DRIFT_PX,
  EXIT_DURATION_MS,
  EXIT_EASING,
  FLIP_DURATION_MS,
  FLIP_EASING,
  flipDeltas,
  REDUCED_MOTION_QUERY,
  type Rect,
} from "@rtc/motion-core";

/**
 * FLIP (First-Last-Invert-Play) glide for a keyed grid. Consumers register
 * each item's root element via `register(key)`; whenever a signal read
 * inside `deps()` changes, moved items animate from their previous screen
 * position to the new one instead of jump-cutting. Geometry changes that
 * arrive between deps changes (window resize, dock panels dragged/resized)
 * refresh the stored origins without animating. Uses the raw WAAPI
 * (`Element.animate`), not the `animateOnce` Motion One wrapper — FLIP fires
 * per-item on every layout, so a short-lived native animation avoids spinning
 * up the Motion One engine per grid item.
 *
 * SOLID PORT NOTE: `deps` is a THUNK (`() => unknown[]`), not a plain array
 * like the React original's dependency-array parameter. React re-invokes the
 * whole component function (and so rebuilds the array from current values)
 * every render; Solid components run their body once, so a plain array built
 * from accessor calls at the call site (`useFlipGrid([filter()])`) would
 * freeze at mount. Passing a function lets the effect below call `deps()`
 * fresh on every run, re-reading whatever signals the caller closes over —
 * Solid's `on()` then tracks exactly those signals, the direct analogue of
 * React's dependency array.
 *
 * No-ops (skips measuring/animating) when the browser/OS prefers reduced
 * motion — the same `matchMedia("(prefers-reduced-motion: reduce)")` seam
 * BootGate/BootSequence already consult.
 */
export function useFlipGrid(
  deps: () => unknown[],
  options: FlipGridOptions = {},
): FlipGridApi {
  const { enter = false, exit = false } = options;
  const elements = new Map<string, HTMLElement>();
  let positions = new Map<string, Rect>();
  let observer: ResizeObserver | null = null;
  // Last DOM node seen for each key, captured in register()'s cleanup. When a
  // deps change unmounts an item, this is what lets the exit ghost re-appear
  // at its old position and fade out (PROTO keeps no exit for tiles — the
  // ghost matches its credit-card `cardOut` treatment instead).
  const exitedNodes = new Map<string, HTMLElement>();

  // The deps-change effect below is the only writer that ANIMATES; everything
  // else that moves the grid (window resize, a dock panel being dragged or
  // resized — both change tile sizes, which ResizeObserver sees) just
  // refreshes the stored origins so the NEXT deps-change FLIP doesn't glide
  // in from a stale position.
  onMount(() => {
    function resnapshot(): void {
      // getBoundingClientRect includes in-flight WAAPI transforms, so a
      // refresh that lands mid-glide would store a transformed rect as the
      // next FLIP's origin (reads as a snap/jump-cut). Skip the refresh
      // while any glide is still running — the deps-change effect re-measures
      // from scratch anyway, so a skipped refresh self-heals on the next FLIP.
      if (anyGlideRunning(elements)) {
        return;
      }

      positions = measurePositions(elements);
    }

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resnapshot);
    observer = ro;
    elements.forEach((el) => {
      ro?.observe(el);
    });
    window.addEventListener("resize", resnapshot);

    onCleanup(() => {
      window.removeEventListener("resize", resnapshot);
      ro?.disconnect();
      observer = null;
    });
  });

  createEffect(
    on(deps, () => {
      const nextPositions = measurePositions(elements);
      const prevPositions = positions;

      if (prevPositions.size > 0 && !prefersReducedMotion()) {
        for (const { key, dx, dy } of flipDeltas(
          prevPositions,
          nextPositions,
        )) {
          const el = elements.get(key);

          if (el) {
            playFlip(el, dx, dy);
          }
        }

        // PROTO _flip: an item with no previous rect just appeared (the
        // filter now includes it) — pop it in with the same easing the
        // glide uses.
        if (enter) {
          nextPositions.forEach((_rect, key) => {
            if (!prevPositions.has(key)) {
              const el = elements.get(key);

              if (el) {
                playEnter(el);
              }
            }
          });
        }

        // An item with no next rect was filtered out. Solid already
        // unmounted it, so fade a ghost of its last DOM node out at its old
        // position. The stage rect comes from a surviving element — the
        // ghost itself is detached, so closest() can't walk up from it.
        if (exit) {
          const stageRect = stageRectFromElements(elements);
          prevPositions.forEach((rect, key) => {
            if (!nextPositions.has(key)) {
              const node = exitedNodes.get(key);

              if (node) {
                playExitGhost(node, rect, stageRect);
              }
            }
          });
        }
      }

      exitedNodes.clear();
      positions = nextPositions;
    }),
  );

  function register(key: string): (el: HTMLElement | null) => void {
    return (el: HTMLElement | null): void => {
      if (el) {
        elements.set(key, el);
        observer?.observe(el);
      } else {
        const prev = elements.get(key);

        if (prev) {
          observer?.unobserve(prev);
          exitedNodes.set(key, prev);
        }

        elements.delete(key);
      }
    };
  }

  return { register };
}

/** True while any registered element still has a running animation. The
 *  registered elements are the bare grid slots, so the only animations on
 *  them are this hook's own WAAPI glides (CSS animations — tick flashes,
 *  bookPulse — live on their descendants and don't false-positive here).
 *  Guarded optional: jsdom elements have no getAnimations. */
function anyGlideRunning(elements: ReadonlyMap<string, HTMLElement>): boolean {
  let running = false;
  elements.forEach((el) => {
    if (el.getAnimations && el.getAnimations().length > 0) {
      running = true;
    }
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
    positions.set(key, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  });
  return positions;
}

function playFlip(el: HTMLElement, dx: number, dy: number): void {
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
}

// PROTO _flip enter branch: `{opacity:0, scale(.78)} → {opacity:1, scale(1)}`
// with the glide's duration + easing — sliding in horizontally from the right
// border of the nearest [data-flip-stage] ancestor (the panel body, so the
// travel spans the full visible panel width). Falls back to the immediate
// grid container, then to a fixed drift.
function playEnter(el: HTMLElement): void {
  // jsdom elements have no animate() — same guard as playExitGhost.
  if (typeof el.animate !== "function") {
    return;
  }

  const rect = el.getBoundingClientRect();
  const stage = (el.closest("[data-flip-stage]") ??
    el.parentElement) as HTMLElement | null;
  const stageRect = stage?.getBoundingClientRect();
  const dx = stageRect ? stageRect.right - rect.right : DRIFT_PX;

  el.animate(
    [
      { opacity: 0, transform: `translate(${dx}px, 0) scale(0.78)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
}

/** First [data-flip-stage] ancestor found from any live element — the panel
 *  body whose borders the enter/exit travel spans. */
function stageRectFromElements(
  elements: ReadonlyMap<string, HTMLElement>,
): DOMRect | null {
  for (const el of elements.values()) {
    const stage = el.closest("[data-flip-stage]");

    if (stage) {
      return stage.getBoundingClientRect();
    }
  }

  return null;
}

/** Re-append the unmounted node as a fixed-position ghost at its last
 *  measured rect and fade it out while it falls to the stage's bottom border
 *  (PROTO cardOut geometry: 340ms shrink to .78). The node is detached —
 *  Solid no longer owns it — and theme custom properties live on
 *  documentElement, so a body-appended ghost keeps its full styling. Both
 *  animated properties composite (transform/opacity). */
function playExitGhost(
  node: HTMLElement,
  rect: Rect,
  stageRect: DOMRect | null,
): void {
  if (typeof node.animate !== "function") {
    return;
  }

  node.style.position = "fixed";
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  node.style.margin = "0";
  node.style.pointerEvents = "none";
  // The ghost is pure visual chrome: it must not read as real UI to
  // assistive tech or to tests that count live tiles by test id (the e2e
  // filter specs run their assertions inside the ghost's 340ms lifetime).
  node.setAttribute("aria-hidden", "true");
  node.removeAttribute("data-testid");
  node.querySelectorAll("[data-testid]").forEach((el) => {
    el.removeAttribute("data-testid");
  });
  document.body.appendChild(node);

  const ghostBottom = rect.top + rect.height;
  const dy = stageRect ? stageRect.bottom - ghostBottom : DRIFT_PX;
  const animation = node.animate(
    [
      { opacity: 1, transform: "translate(0, 0) scale(1)" },
      { opacity: 0, transform: `translate(0, ${dy}px) scale(0.78)` },
    ],
    { duration: EXIT_DURATION_MS, easing: EXIT_EASING, fill: "forwards" },
  );

  function remove(): void {
    node.remove();
  }

  animation.finished.then(remove, remove);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

export interface FlipGridApi {
  register: (key: string) => (el: HTMLElement | null) => void;
}

export interface FlipGridOptions {
  /** Pop newly-appearing items in (fade + scale from .78). PROTO _flip does
   *  this by default; opt-in here so RfqsPanel's own cardIn keeps sole
   *  ownership of its entry animation (PROTO passes enter:false there). */
  enter?: boolean;
  /** Fade just-removed items out in place via a detached-node ghost. */
  exit?: boolean;
}
