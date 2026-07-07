import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Watchlist-only rank glide (ported from client-prototype's Watchlist/useRankGlide.ts,
// itself PROTO dc.html ~879-892): unlike the generic FLIP glide in
// useFlipGrid.ts (translate only, keyed on DOM position deltas), a re-sorted
// watchlist row also plays a direction-colored highlight pulse — green if the
// row rose in rank, red if it fell. Rows recycle by index while the *data*
// reorders, so the glide has to be driven from rank deltas (index in `order`
// vs the previous render's index) rather than measured positions.
//
// I4 fix (rank-glide churn): the default "chg" sort re-sorts from up to six
// INDEPENDENT 500ms quote streams, each triggering a parent re-render — up to
// ~12 candidate reorders/sec against a 560ms glide. Committing every one of
// those (re-rendering rows in the new order AND kicking off a fresh WAAPI
// glide) starts overlapping animations and corrupts rowHeight()'s mid-glide
// measurement — rows visibly stack/overlap. The hook now COALESCES: only ONE
// order is "committed" (and returned, for the caller to actually render/key
// off) per glide window — see `coalesceOrder` below and its use in the effect.

export type RankDirection = "rose" | "fell" | "unchanged";

const GLIDE_DUR_MS = 560;
const GLIDE_EASING = "cubic-bezier(.34,1.28,.5,1)";
const HIGHLIGHT_DUR_MS = 820;
const HIGHLIGHT_EASING = "ease-out";
const ROSE_COLOR = "rgba(43,255,179,.95)";
const FELL_COLOR = "rgba(255,93,115,.95)";
const FALLBACK_ROW_HEIGHT = 52;
// Mirrors useFlipGrid.ts's house pattern for gating on the OS/browser's
// reduced-motion preference (no reduceMotion pref seam exists in the app).
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Pure so it can be exercised directly (jsdom lacks Element.animate, so the
// per-row direction — not whether WAAPI ran — is what tests pin down).
export function computeRankDirections(
  prevRank: Record<string, number> | undefined,
  order: readonly string[],
): Record<string, RankDirection> {
  const directions: Record<string, RankDirection> = {};

  order.forEach((sym, index) => {
    const oldIndex = prevRank?.[sym];

    if (oldIndex === undefined || oldIndex === index) {
      directions[sym] = "unchanged";
    } else {
      directions[sym] = oldIndex > index ? "rose" : "fell";
    }
  });

  return directions;
}

/** True when two symbol orders are identical (same symbols, same sequence). */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((sym, index) => {
    return sym === b[index];
  });
}

export interface CoalesceDecision {
  /** The order the caller should render/glide against THIS render. */
  readonly committed: readonly string[];
  /** The latest candidate order held back because a glide is still
   * in-flight, or null when nothing is buffered. Only ever the MOST RECENT
   * candidate — a second candidate arriving before the first is applied
   * simply replaces it, so a burst of rapid changes collapses into exactly
   * one deferred commit. */
  readonly bufferedPending: readonly string[] | null;
}

/** Pure decision function for the I4 coalescing gate — no DOM/WAAPI, so it's
 * directly unit-testable (see useRankGlide.test.ts). Given what's currently
 * committed, what (if anything) is already buffered, the newly observed
 * candidate order, and whether a glide is still animating:
 *   - a candidate matching what's already committed is a no-op (and drops
 *     any now-stale buffered candidate — the order round-tripped back);
 *   - while idle, the candidate commits immediately;
 *   - while gliding, the candidate is buffered instead of committed — the
 *     hook's effect applies it once the in-flight glide's WAAPI animations
 *     finish (see useRankGlide below), which is what turns a burst of rapid
 *     candidates into a single reorder per glide window. */
export function coalesceOrder(
  committed: readonly string[],
  pending: readonly string[] | null,
  candidate: readonly string[],
  gliding: boolean,
): CoalesceDecision {
  if (sameOrder(candidate, committed)) {
    return { committed, bufferedPending: null };
  }

  if (sameOrder(candidate, pending ?? [])) {
    return { committed, bufferedPending: pending };
  }

  if (gliding) {
    return { committed, bufferedPending: candidate };
  }

  return { committed: candidate, bufferedPending: null };
}

// Exported so the length<2 fallback is directly unit-testable (see
// useRankGlide.test.ts) — a real DOM/effect scenario can't exercise it, since
// there's nothing to glide (and so no committed-order change to trigger the
// effect at all) with fewer than two rows.
export function rowHeight(nodes: HTMLElement[]): number {
  if (nodes.length < 2) {
    return FALLBACK_ROW_HEIGHT;
  }

  // `nodes.length >= 2` here, so indices 0/1 are always in range.
  const delta =
    nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top;

  return delta || FALLBACK_ROW_HEIGHT;
}

// playGlide/playHighlight now return the live Animation (or undefined when
// Element.animate isn't available, e.g. jsdom) so the caller can await
// `.finished` and know when it's safe to apply a buffered reorder — that's
// the I4 coalescing gate's only signal that a glide is still in flight.

function playGlide(node: HTMLElement, dy: number): Animation | undefined {
  try {
    return node.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: GLIDE_DUR_MS, easing: GLIDE_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the glide.
    return undefined;
  }
}

function playHighlight(
  node: HTMLElement,
  direction: RankDirection,
): Animation | undefined {
  const color = direction === "rose" ? ROSE_COLOR : FELL_COLOR;

  try {
    return node.animate(
      [
        { boxShadow: `inset 3px 0 0 ${color},0 0 0 0 ${color}`, offset: 0 },
        {
          boxShadow: `inset 3px 0 0 ${color},0 0 16px -3px ${color}`,
          offset: 0.3,
        },
        {
          boxShadow: "inset 0 0 0 0 transparent,0 0 0 0 transparent",
          offset: 1,
        },
      ],
      { duration: HIGHLIGHT_DUR_MS, easing: HIGHLIGHT_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the highlight.
    return undefined;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/** Glides each `[data-watch-sym]` row keyed under `rootRef` from its previous
 * rank to its current one, with a direction-colored highlight pulse, and
 * returns the order the caller should actually RENDER rows in (the
 * "committed" order) — the caller must key/iterate off this return value,
 * not the raw `candidate` it passed in, so the DOM's physical row order never
 * jumps ahead of what the glide is animating from/to.
 *
 * Candidates arriving while a glide is still in flight (WAAPI animations not
 * yet `.finished`) are coalesced: only the LATEST is buffered and applied the
 * moment the current glide settles, so a burst of quote-driven re-sorts
 * (~12/sec under the default "chg" sort) collapses into at most one reorder
 * per glide window instead of restarting overlapping animations (I4 fix).
 * No-ops under reduced motion or before a previous rank has been recorded
 * (the first render never glides). */
export function useRankGlide(
  rootRef: RefObject<HTMLElement | null>,
  candidate: readonly string[],
): readonly string[] {
  const prevRankRef = useRef<Record<string, number> | undefined>(undefined);
  const glidingRef = useRef(false);
  const pendingRef = useRef<readonly string[] | null>(null);
  const [committed, setCommitted] = useState<readonly string[]>(candidate);

  // Decide whether to commit `candidate` now or buffer it — in an effect
  // (never during render): refs may only be read/written outside the render
  // path (react-hooks/refs), and `coalesceOrder` needs `pendingRef`/
  // `glidingRef`'s CURRENT values. A change is either committed now (idle) or
  // buffered until the in-flight glide settles (see the glide effect's
  // `.finished` handling below) — that's what coalesces a burst of rapid
  // candidates into at most one reorder per glide window (I4 fix). `candidate`
  // is a fresh array every render, so this runs every render too; the
  // `sameOrder` check below makes every no-op run cheap.
  useEffect(() => {
    if (sameOrder(candidate, committed)) return;

    const decision = coalesceOrder(
      committed,
      pendingRef.current,
      candidate,
      glidingRef.current,
    );

    pendingRef.current = decision.bufferedPending;

    if (!sameOrder(decision.committed, committed)) {
      setCommitted(decision.committed);
    }
  }, [candidate, committed]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const order = committed;

    if (root != null) {
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-watch-sym]"),
      );
      const animations: Animation[] = [];

      if (
        !prefersReducedMotion() &&
        prevRankRef.current != null &&
        nodes.length > 0
      ) {
        const directions = computeRankDirections(prevRankRef.current, order);
        const rowH = rowHeight(nodes);

        nodes.forEach((node) => {
          // Guaranteed present — `nodes` came from
          // querySelectorAll("[data-watch-sym]"), so every match has the
          // attribute (unlike getAttribute's general `string | null` type).
          const sym = node.getAttribute("data-watch-sym") as string;
          const oldIndex = prevRankRef.current?.[sym];
          // Current rank comes from `order`, not DOM position: rows only
          // physically move once React reconciles the keyed re-render, but
          // this effect runs before that's guaranteed to have settled.
          const currentIndex = order.indexOf(sym);

          if (
            oldIndex !== undefined &&
            currentIndex !== -1 &&
            oldIndex !== currentIndex
          ) {
            const dy = (oldIndex - currentIndex) * rowH;
            const glideAnim = playGlide(node, dy);
            if (glideAnim) animations.push(glideAnim);
            // `sym` is a member of `order` (currentIndex !== -1 above came
            // from `order.indexOf(sym)`), and computeRankDirections gives
            // every member of `order` an entry — so this is never undefined.
            const highlightAnim = playHighlight(node, directions[sym]);
            if (highlightAnim) animations.push(highlightAnim);
          }
        });
      }

      const nextRank: Record<string, number> = {};
      order.forEach((sym, index) => {
        nextRank[sym] = index;
      });
      prevRankRef.current = nextRank;

      // Gate the NEXT commit on these animations settling — jsdom (contract/
      // unit tests) never produces a real Animation here (Element.animate
      // throws, caught above), so `animations` stays empty and gliding never
      // engages there; only a real browser's WAAPI run holds a reorder back.
      if (animations.length > 0) {
        glidingRef.current = true;
        void Promise.allSettled(
          animations.map((anim) => {
            return anim.finished;
          }),
        ).then(() => {
          glidingRef.current = false;
          const next = pendingRef.current;

          if (next != null) {
            pendingRef.current = null;
            setCommitted(next);
          }
        });
      }
    }
    // Keyed on `committed` (not `candidate`): this effect's whole job is to
    // glide from the PREVIOUS committed order to the current one, so it must
    // fire exactly when `committed` actually changes — never for a candidate
    // that got buffered instead (nothing moved in the DOM yet).
  }, [committed, rootRef]);

  return committed;
}
