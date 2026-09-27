import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-logic";

/** The path (child indices from the root) of the split that BOUNDS a
 * maximize: everything inside the boundary subtree yields to the maximized
 * panel (siblings collapse to strip bars); everything outside renders
 * untouched. `[]` — the root, i.e. the whole dock — unless the maximized
 * panel's spec opts into `maximizeScope: "nearest-column"`, in which case it
 * is the nearest ancestor `dir === "column"` split (the standalone design's
 * rail panels maximize within their own column); a nearest-column panel with
 * no column ancestor falls back to the root.
 *
 * `null` means NO maximize applies: nothing is maximized, or the maximized
 * id is not a leaf of `root`. The second case is reachable — the layout
 * machine legitimately holds a Dockview-only chart instance id
 * (`eq-chart:<symbol>`) in `maximized`, and an in-house render of that state
 * has no such leaf; treating it as a root-scope maximize would strip EVERY
 * panel in the tab with no maximized panel to restore from. Pure render-time
 * policy: LayoutState and the layout machine know nothing of scopes. */
export function maximizeBoundaryPath(
  root: LayoutNode,
  maximizedId: PanelId | null,
  specs: Readonly<Record<PanelId, PanelSpec>>,
): readonly number[] | null {
  if (maximizedId === null) {
    return null;
  }

  const panelPath = pathToPanel(root, maximizedId);

  if (panelPath === null) {
    return null;
  }

  if (specs[maximizedId]?.maximizeScope !== "nearest-column") {
    return [];
  }

  // Nearest first: walk ancestor paths from the panel's immediate parent up.
  for (let len = panelPath.length - 1; len >= 0; len--) {
    const ancestorPath = panelPath.slice(0, len);
    const ancestor = nodeAtPath(root, ancestorPath);

    if (ancestor?.kind === "split" && ancestor.dir === "column") {
      return ancestorPath;
    }
  }

  return [];
}

/** Child-index path from `root` to the panel leaf with this id, or null when
 * the id is not in the tree. */
function pathToPanel(root: LayoutNode, panelId: PanelId): number[] | null {
  if (root.kind === "panel") {
    return root.panelId === panelId ? [] : null;
  }

  for (let i = 0; i < root.children.length; i++) {
    const childPath = pathToPanel(root.children[i], panelId);

    if (childPath !== null) {
      return [i, ...childPath];
    }
  }

  return null;
}

/** The node a child-index path points at, or null when the path walks off the
 * tree. */
export function nodeAtPath(
  root: LayoutNode,
  path: readonly number[],
): LayoutNode | null {
  let node: LayoutNode = root;

  for (const index of path) {
    if (node.kind !== "split") {
      return null;
    }

    const child: LayoutNode | undefined = node.children[index];

    if (child === undefined) {
      return null;
    }

    node = child;
  }

  return node;
}
