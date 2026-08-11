import type { LayoutNode, PanelId } from "./layoutPort";

/** Design-value default width (css px) of a freshly-created dock column — the
 * same convention as the default trees' own rail `initialPx` values (FX 360,
 * equities 290, credit 330). Still draggable: the first resize on it clears
 * `initialPx` like any other split (see `LayoutMachine.ts`'s `resizeAt`). */
export const DOCK_COLUMN_INITIAL_PX = 360;

/** Fraction the trailing dock column takes when it is first created or
 * extended at row level (wrap, or append-as-new-last-child) — the existing
 * sibling(s) are rescaled proportionally to make room, so their *relative*
 * weights are unchanged (see `appendColumnToRow`'s doc). */
const DOCK_COLUMN_FRACTION = 0.25;

/** Reserved for the pure-helper surface's public shape; `insertDockedLeaf`
 * itself returns the bare `LayoutNode` (see its doc). */
export interface DockInsertResult {
  readonly root: LayoutNode;
}

function collectLeafIds(node: LayoutNode): readonly PanelId[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectLeafIds);
}

/** Every leaf id under `root` that is NOT in `staticIds` — the "docked" ids,
 * identified purely structurally (no marker field on `LayoutNode`). Passing
 * `staticIds: []` returns every leaf id in `root`, which is how callers
 * derive a tab's static-tree id set from its own `port.initial.root` before
 * any docking has happened (see `LayoutMachine.ts`). */
export function dockedLeafIds(
  root: LayoutNode,
  staticIds: readonly PanelId[],
): readonly PanelId[] {
  const staticSet = new Set(staticIds);
  return collectLeafIds(root).filter((id) => {
    return !staticSet.has(id);
  });
}

/** Structural dock-column test: a column split, or a single leaf, whose every
 * leaf id is foreign to `staticSet` (non-empty and exhaustive) — see the
 * module doc and Task 2's brief for why this can't reuse a marker field. A
 * row split, or a column split/leaf that contains even one static id (e.g.
 * an FX/Equities rail), is never a dock column — that's what stops a real
 * rail from being mistaken for one. */
function isDockColumn(
  node: LayoutNode,
  staticSet: ReadonlySet<PanelId>,
): boolean {
  if (node.kind === "panel") {
    return !staticSet.has(node.panelId);
  }

  if (node.dir !== "column") {
    return false;
  }

  const ids = collectLeafIds(node);
  return (
    ids.length > 0 &&
    ids.every((id) => {
      return !staticSet.has(id);
    })
  );
}

function equalFractions(count: number): readonly number[] {
  return Array.from({ length: count }, () => {
    return 1 / count;
  });
}

function renormalize(sizes: readonly number[]): readonly number[] {
  const sum = sizes.reduce((a, b) => {
    return a + b;
  }, 0);
  return sum > 0
    ? sizes.map((s) => {
        return s / sum;
      })
    : sizes;
}

/** Append `leaf` as a new last child of row `row`, rescaling the existing
 * children's sizes by `1 - DOCK_COLUMN_FRACTION` (preserving their relative
 * weights, which already summed to 1) and giving the new child
 * `DOCK_COLUMN_FRACTION` plus a `DOCK_COLUMN_INITIAL_PX` design width. This
 * is the exact inverse of `removeDockedLeaf`'s renormalize-on-drop, which is
 * what makes `remove(insert(tree, id), id)` restore the original sizes. Only
 * ever called with a row split (defensive no-op guard mirrors `resizeAt`'s
 * style, avoiding a discriminated-variant type extraction for one internal
 * call site). */
function appendColumnToRow(row: LayoutNode, leaf: LayoutNode): LayoutNode {
  if (row.kind !== "split") {
    return row;
  }

  const kept = row.sizes.map((s) => {
    return s * (1 - DOCK_COLUMN_FRACTION);
  });
  const sizes = [...kept, DOCK_COLUMN_FRACTION];
  const fixedPx = row.fixedPx ? [...row.fixedPx, undefined] : undefined;
  const priorInitialPx =
    row.initialPx ??
    row.children.map(() => {
      return undefined;
    });
  const initialPx = [...priorInitialPx, DOCK_COLUMN_INITIAL_PX];

  return {
    ...row,
    children: [...row.children, leaf],
    sizes,
    fixedPx,
    initialPx,
  };
}

/** Grow the trailing dock column (already identified by `isDockColumn`) by
 * one leaf, giving every child of the column equal fractions — a single
 * leaf becomes a 2-child column split at 0.5/0.5, an existing N-child column
 * split becomes N+1 children at 1/(N+1) each. Never carries stale
 * `fixedPx`/`initialPx` — a dock column is only ever built by this function
 * and never has either. */
function growDockColumn(dockColumn: LayoutNode, leaf: LayoutNode): LayoutNode {
  const children =
    dockColumn.kind === "panel"
      ? [dockColumn, leaf]
      : [...dockColumn.children, leaf];

  return {
    kind: "split",
    dir: "column",
    children,
    sizes: equalFractions(children.length),
  };
}

/** Insert a new docked leaf `panelId` into `root`, per Task 2's brief:
 * - `root` is not a row split → wrap it in a new row `[root, dockLeaf]` at
 *   0.75/0.25 with the dock slot's `initialPx` at `DOCK_COLUMN_INITIAL_PX`.
 * - `root` is a row whose last child is already the (structurally
 *   identified, via `staticIds`) dock column → grow that column with equal
 *   fractions.
 * - `root` is a row without a dock column (e.g. every default tree's own
 *   legitimate rail, whose leaf ids ARE in `staticIds`) → append a brand
 *   new dock column as a further last child.
 * - `panelId` already present anywhere in the tree → no-op, same reference.
 *
 * `staticIds` is the tab's static-tree leaf-id set (every leaf id in the
 * tab's `port.initial.root`, BEFORE any docking) — the caller derives it
 * once via `dockedLeafIds(port.initial.root, [])` and threads it through
 * every insert call for that machine's lifetime; it's what lets a real rail
 * (all-static leaf ids) be told apart from a genuine dock column (all-foreign
 * leaf ids) using the exact same structural shape. */
export function insertDockedLeaf(
  root: LayoutNode,
  panelId: PanelId,
  staticIds: readonly PanelId[],
): LayoutNode {
  if (collectLeafIds(root).includes(panelId)) {
    return root;
  }

  const newLeaf: LayoutNode = { kind: "panel", panelId };

  if (root.kind !== "split" || root.dir !== "row") {
    return {
      kind: "split",
      dir: "row",
      children: [root, newLeaf],
      sizes: [1 - DOCK_COLUMN_FRACTION, DOCK_COLUMN_FRACTION],
      initialPx: [undefined, DOCK_COLUMN_INITIAL_PX],
    };
  }

  const staticSet = new Set(staticIds);
  const lastIndex = root.children.length - 1;
  const lastChild = root.children[lastIndex];

  if (lastChild !== undefined && isDockColumn(lastChild, staticSet)) {
    const grown = growDockColumn(lastChild, newLeaf);
    const children = root.children.map((c, i) => {
      return i === lastIndex ? grown : c;
    });
    return { ...root, children };
  }

  return appendColumnToRow(root, newLeaf);
}

interface RemoveResult {
  readonly node: LayoutNode;
  readonly changed: boolean;
}

/** Drop the child at `index` from split `node`: filters `children`/`sizes`
 * (renormalizing the remaining sizes to sum to 1) and the matching
 * `fixedPx`/`initialPx` entries if present, keeping every array the same
 * length as `children`. A single remaining child collapses the split away
 * entirely — the split node itself vanishes and its lone child takes its
 * place, which is what lets removing the last docked leaf restore the exact
 * pre-insert tree. Only ever called with a split node (defensive no-op guard,
 * same convention as `appendColumnToRow`). */
function dropChild(node: LayoutNode, index: number): LayoutNode {
  if (node.kind !== "split") {
    return node;
  }

  const children = node.children.filter((_, i) => {
    return i !== index;
  });

  if (children.length === 1) {
    return children[0] as LayoutNode;
  }

  const sizes = renormalize(
    node.sizes.filter((_, i) => {
      return i !== index;
    }),
  );

  const fixedPx = node.fixedPx
    ? node.fixedPx.filter((_, i) => {
        return i !== index;
      })
    : undefined;

  const initialPx = node.initialPx
    ? node.initialPx.filter((_, i) => {
        return i !== index;
      })
    : undefined;

  return { ...node, children, sizes, fixedPx, initialPx };
}

function removeFromNode(node: LayoutNode, panelId: PanelId): RemoveResult {
  if (node.kind === "panel") {
    return { node, changed: false };
  }

  const directIndex = node.children.findIndex((c) => {
    return c.kind === "panel" && c.panelId === panelId;
  });

  if (directIndex !== -1) {
    return { node: dropChild(node, directIndex), changed: true };
  }

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i] as LayoutNode;
    const childResult = removeFromNode(child, panelId);

    if (childResult.changed) {
      const children = node.children.map((c, idx) => {
        return idx === i ? childResult.node : c;
      });
      return { node: { ...node, children }, changed: true };
    }
  }

  return { node, changed: false };
}

/** Remove the leaf `panelId` from `root`, wherever it lives in the tree —
 * per Task 2's brief: the split it was removed from renormalizes its
 * remaining siblings' sizes to sum to 1, and a split left with a single
 * child collapses to that child (so removing a tab's last docked leaf
 * restores the exact pre-insert tree — see the round-trip test). An unknown
 * `panelId` is a no-op, returning the same `root` reference. Pure structural
 * removal: unlike `insertDockedLeaf` it needs no `staticIds` — deleting a
 * leaf by id and collapsing empty splits never depends on which ids are
 * "static". */
export function removeDockedLeaf(
  root: LayoutNode,
  panelId: PanelId,
): LayoutNode {
  const result = removeFromNode(root, panelId);
  return result.changed ? result.node : root;
}
