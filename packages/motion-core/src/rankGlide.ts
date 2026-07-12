export type RankDirection = "rose" | "fell" | "unchanged";

export const GLIDE_DUR_MS = 560;
export const GLIDE_EASING = "cubic-bezier(.34,1.28,.5,1)";
export const HIGHLIGHT_DUR_MS = 820;
export const HIGHLIGHT_EASING = "ease-out";
export const FALLBACK_ROW_HEIGHT = 52;

/** Pure so it can be exercised directly (jsdom lacks Element.animate, so the
 *  per-row direction — not whether WAAPI ran — is what tests pin down). */
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
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

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
 *  directly unit-testable. Given what's currently committed, what (if anything)
 *  is already buffered, the newly observed candidate order, and whether a glide
 *  is still animating:
 *    - a candidate matching what's already committed is a no-op (and drops any
 *      now-stale buffered candidate — the order round-tripped back);
 *    - while idle, the candidate commits immediately;
 *    - while gliding, the candidate is buffered instead of committed — the
 *      hook's effect applies it once the in-flight glide's WAAPI animations
 *      finish, which turns a burst of rapid candidates into a single reorder
 *      per glide window. */
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
