/**
 * The only sanctioned readers of dockview's `api.groups` (an ESLint
 * `no-restricted-syntax` ban enforces it for the rest of this package's
 * source).
 *
 * dockview 8.3.1 does NOT prune `api.groups` when a group leaves the grid: a
 * popped-out group (in another window) and a floating group (a box over the
 * grid) are both still listed. A caller that means "what is in the dock" and
 * walks the raw list silently counts them. That has shipped twice: a
 * popped-out panel counted as able to absorb spare grid space (#745), and a
 * maximize that would have stripped a float to a 32px bar (R7). So every
 * caller names which of the two questions it is asking.
 */

/** A group narrowed to where it lives. `location` is optional because test
 * doubles of a group do not always model it. */
interface LocatedGroup {
  readonly api: { readonly location?: { readonly type: string } };
}

/** Anything that lists groups the way `DockviewApi` does. */
interface GroupSource<G> {
  readonly groups: readonly G[];
}

/** True for a group that is in the grid, as opposed to floating or popped out.
 * A panel can stop being in the grid in three ways (closed, popped out,
 * floated), and only the first removes it from `api.groups`.
 *
 * An absent location counts as `"grid"`: wrongly EXCLUDING a group is the
 * more dangerous direction, since it would release a constraint that is still
 * doing its job. */
export function isInGrid(group: LocatedGroup): boolean {
  return (group.api.location?.type ?? "grid") === "grid";
}

/** The groups that are in the grid: the answer to "what is in the dock". */
export function gridGroups<G extends LocatedGroup>(
  source: GroupSource<G>,
): readonly G[] {
  return source.groups.filter(isInGrid);
}

/** Every group this dockview owns, wherever it lives: in the grid, floating
 * over it, or popped out into another window. For callers that need the
 * floating or popped-out ones too. */
export function groupsAnywhere<G>(source: GroupSource<G>): readonly G[] {
  return source.groups;
}
