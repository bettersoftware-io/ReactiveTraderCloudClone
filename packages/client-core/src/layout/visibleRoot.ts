import type { LayoutNode, PanelId } from "#/layout/layoutPort";

/** The layout tree with every `closed` leaf pruned — the pure projection
 * BOTH engines render close/reopen through (the in-house engine renders this
 * tree directly; the Dockview bridge diffs the closed set into engine
 * close/reopen calls instead, but the semantics are this function's).
 *
 * Shape rules: a split whose children all prune away prunes itself; a split
 * left with one child hoists that child into its own slot (no single-child
 * splits survive); a split keeping several children renormalises `sizes` to
 * sum 1 and slices `fixedPx`/`initialPx` by the same kept-index mask,
 * preserving field absence. Returns `root` REFERENTIALLY UNCHANGED when
 * nothing pruned (render-path memo friendliness). Never returns an empty
 * tree — the LayoutMachine's close reducer floor guarantees ≥1 visible
 * static leaf, so the root itself can never prune away. */
export function visibleRootOf(
  root: LayoutNode,
  closed: readonly PanelId[],
): LayoutNode {
  if (closed.length === 0) {
    return root;
  }

  return pruneNode(root, closed) ?? root;
}

function pruneNode(
  node: LayoutNode,
  closed: readonly PanelId[],
): LayoutNode | null {
  if (node.kind === "panel") {
    return closed.includes(node.panelId) ? null : node;
  }

  const keptIndices: number[] = [];
  const keptChildren: LayoutNode[] = [];
  let changed = false;

  for (const [index, child] of node.children.entries()) {
    const pruned = pruneNode(child, closed);

    if (pruned === null) {
      changed = true;
      continue;
    }

    if (pruned !== child) {
      changed = true;
    }

    keptIndices.push(index);
    keptChildren.push(pruned);
  }

  if (!changed) {
    return node;
  }

  if (keptChildren.length === 0) {
    return null;
  }

  if (keptChildren.length === 1) {
    return keptChildren[0];
  }

  const keptSum = keptIndices.reduce((total, index) => {
    return total + node.sizes[index];
  }, 0);
  const sizes = keptIndices.map((index) => {
    return keptSum > 0 ? node.sizes[index] / keptSum : 1 / keptIndices.length;
  });

  return {
    kind: "split",
    dir: node.dir,
    children: keptChildren,
    sizes,
    // Preserve field absence — only spread a px key the original carried
    // (mirrors validateLayoutNode's construction).
    ...(node.fixedPx !== undefined
      ? {
          fixedPx: keptIndices.map((index) => {
            return node.fixedPx?.[index];
          }),
        }
      : {}),
    ...(node.initialPx !== undefined
      ? {
          initialPx: keptIndices.map((index) => {
            return node.initialPx?.[index];
          }),
        }
      : {}),
  };
}
