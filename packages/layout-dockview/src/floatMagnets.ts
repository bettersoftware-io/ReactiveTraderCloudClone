/** The geometry of floating panels that behave like magnets: snapping a
 * dragged float flush to its siblings, deciding which side two floats touch
 * on, sizing the window two floats merge into, and the release decision.
 * Pure — no DOM, no dockview — so every rule is provable on numbers alone.
 * Boxes are in the dock container's pixel space, top-left anchored. */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Relative to the TARGET: `"right"` puts the newcomer to the target's right.
 * Same vocabulary as dockview's `moveTo` `position`. */
export type AttachSide = "left" | "right" | "top" | "bottom";

export interface SnapEngagement {
  readonly other: Box;
  readonly side: AttachSide;
}

export interface SnapResult {
  readonly left: number;
  readonly top: number;
  /** The sibling edge the drag engaged on, or null when nothing snapped. */
  readonly engaged: SnapEngagement | null;
}

/** How near, in px, a dragged edge must come to a sibling's edge to snap. */
export const FLOAT_SNAP_DISTANCE_PX = 14;
/** How far apart two edges may still be at release and count as touching. */
export const FLOAT_FLUSH_TOLERANCE_PX = 12;

/** The dragged box pulled flush to the nearest sibling edge within
 * {@link FLOAT_SNAP_DISTANCE_PX}, its top (side by side) or left (stacked)
 * aligned too when that is also within range. Only floats that overlap the
 * dragged box on the perpendicular axis count. `suspended` (Option held)
 * returns the proposal as is. */
export function snapToSiblings(
  proposed: Box,
  others: readonly Box[],
  suspended: boolean,
): SnapResult {
  if (suspended) {
    return { left: proposed.left, top: proposed.top, engaged: null };
  }

  let best: EdgeCandidate | null = null;

  for (const other of others) {
    for (const candidate of edgeCandidates(proposed, other)) {
      if (
        candidate.distance <= FLOAT_SNAP_DISTANCE_PX &&
        (best === null || candidate.distance < best.distance)
      ) {
        best = candidate;
      }
    }
  }

  return best === null
    ? { left: proposed.left, top: proposed.top, engaged: null }
    : { left: best.left, top: best.top, engaged: best.engaged };
}

/** Which side of `theirs` the box `mine` sits flush against, within
 * {@link FLOAT_FLUSH_TOLERANCE_PX}, or null — a corner-only touch is null. */
export function flushSideOf(mine: Box, theirs: Box): AttachSide | null {
  if (overlapsVertically(mine, theirs)) {
    if (Math.abs(mine.left - right(theirs)) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "right";
    }

    if (Math.abs(right(mine) - theirs.left) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "left";
    }
  }

  if (overlapsHorizontally(mine, theirs)) {
    if (Math.abs(mine.top - bottom(theirs)) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "bottom";
    }

    if (Math.abs(bottom(mine) - theirs.top) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "top";
    }
  }

  return null;
}

export interface WidthRule {
  readonly width: number;
  readonly lock: number | undefined;
}

/** The width every member of a STACKED cluster takes: a lock wins over a
 * free width (spec §4.2 — the free panel adopts it), two locks keep the
 * target's, two free widths keep the target's. */
export function stackedWidthFor(
  target: WidthRule,
  incoming: WidthRule,
): number {
  if (target.lock !== undefined) {
    return target.lock;
  }

  return incoming.lock ?? target.width;
}

export interface AttachPlan {
  /** The merged window's box. */
  readonly window: Box;
  /** The newcomer's extent along the split axis — its width side by side,
   * its height stacked — so it keeps the size it arrived with. */
  readonly newcomerExtent: number;
  /** Stacked only: the width every member takes. Null side by side. */
  readonly memberWidth: number | null;
}

/** The width lock, if any, of each float taking part in an attach. */
export interface AttachLocks {
  readonly mine: number | undefined;
  readonly theirs: number | undefined;
}

/** The window two floats merge into when `mine` attaches on `side` of
 * `theirs` (spec §4.2). */
export function attachedWindowFor(
  mine: Box,
  theirs: Box,
  side: AttachSide,
  locks: AttachLocks,
): AttachPlan {
  if (side === "left" || side === "right") {
    const left = Math.min(mine.left, theirs.left);
    const top = Math.min(mine.top, theirs.top);

    return {
      window: {
        left,
        top,
        width: Math.max(right(mine), right(theirs)) - left,
        height: Math.max(mine.height, theirs.height),
      },
      newcomerExtent: mine.width,
      memberWidth: null,
    };
  }

  const width = stackedWidthFor(
    { width: theirs.width, lock: locks.theirs },
    { width: mine.width, lock: locks.mine },
  );

  return {
    window: {
      left: theirs.left,
      top: side === "top" ? theirs.top - mine.height : theirs.top,
      width,
      height: mine.height + theirs.height,
    },
    newcomerExtent: mine.height,
    memberWidth: width,
  };
}

export interface ReleaseContext {
  /** The dragged window holds exactly one group. */
  readonly lone: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** A detach happened earlier in this same drag. */
  readonly detachedThisDrag: boolean;
  readonly side: AttachSide | null;
}

/** A {@link ReleaseContext} known to carry a flush side. */
export type AttachingRelease = ReleaseContext & { readonly side: AttachSide };

/** Whether releasing the drag attaches (spec §3.2): a lone float, flush
 * against a sibling, with no Option (snap suspended), no Shift (dock home),
 * and no detach earlier in the same motion. */
export function shouldAttachOnRelease(
  context: ReleaseContext,
): context is AttachingRelease {
  return (
    context.lone &&
    !context.altKey &&
    !context.shiftKey &&
    !context.detachedThisDrag &&
    context.side !== null
  );
}

interface EdgeCandidate {
  readonly distance: number;
  readonly left: number;
  readonly top: number;
  readonly engaged: SnapEngagement;
}

/** Every edge of `other` the `proposed` box could snap to, with the position
 * it would take there. */
function edgeCandidates(proposed: Box, other: Box): EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];

  if (overlapsVertically(proposed, other)) {
    const top =
      Math.abs(other.top - proposed.top) <= FLOAT_SNAP_DISTANCE_PX
        ? other.top
        : proposed.top;

    candidates.push(
      {
        distance: Math.abs(proposed.left - right(other)),
        left: right(other),
        top,
        engaged: { other, side: "right" },
      },
      {
        distance: Math.abs(right(proposed) - other.left),
        left: other.left - proposed.width,
        top,
        engaged: { other, side: "left" },
      },
    );
  }

  if (overlapsHorizontally(proposed, other)) {
    const left =
      Math.abs(other.left - proposed.left) <= FLOAT_SNAP_DISTANCE_PX
        ? other.left
        : proposed.left;

    candidates.push(
      {
        distance: Math.abs(proposed.top - bottom(other)),
        left,
        top: bottom(other),
        engaged: { other, side: "bottom" },
      },
      {
        distance: Math.abs(bottom(proposed) - other.top),
        left,
        top: other.top - proposed.height,
        engaged: { other, side: "top" },
      },
    );
  }

  return candidates;
}

function right(box: Box): number {
  return box.left + box.width;
}

function bottom(box: Box): number {
  return box.top + box.height;
}

function overlapsVertically(a: Box, b: Box): boolean {
  return a.top < bottom(b) && b.top < bottom(a);
}

function overlapsHorizontally(a: Box, b: Box): boolean {
  return a.left < right(b) && b.left < right(a);
}
