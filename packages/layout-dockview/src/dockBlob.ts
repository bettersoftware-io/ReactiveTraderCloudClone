import type { SerializedDockview } from "dockview";

type GridNode = SerializedDockview["grid"]["root"];

/**
 * Makes a `DockviewApi.toJSON()` result restore to EXACTLY the layout it was
 * taken from when the theme carries a `gap`.
 *
 * Dockview lays a split's `n` children out at `model − gap × (n − 1) / n`
 * each (the margins have to come from somewhere), and serialises those
 * RENDERED sizes — so a saved branch's children sum to `gap × (n − 1)` less
 * than the branch. On `fromJSON` dockview sees the shortfall and
 * redistributes it proportionally, which is not the inverse of the even
 * shave: every save/load cycle moves the sashes a little (a 360px rail
 * measured 360 → 358 → 349 across three reloads), and a mount that
 * round-trips once (React's StrictMode double effect) no longer matches
 * one that does not. Adding each child's share back turns the saved sizes
 * into the model sizes dockview started from, so the restore is exact and
 * the blob is stable under any number of cycles. A gap of 0 is the
 * identity.
 */
export function compensateGap(
  layout: SerializedDockview,
  gap: number,
): SerializedDockview {
  if (gap === 0) {
    return layout;
  }

  return {
    ...layout,
    grid: { ...layout.grid, root: compensateNode(layout.grid.root, gap) },
  };
}

function compensateNode(node: GridNode, gap: number): GridNode {
  if (node.type !== "branch" || !Array.isArray(node.data)) {
    return node;
  }

  const children = node.data;
  const share = (gap * Math.max(0, children.length - 1)) / children.length;

  return {
    ...node,
    data: children.map((child) => {
      const compensated = compensateNode(child, gap);

      return typeof compensated.size === "number"
        ? { ...compensated, size: compensated.size + share }
        : compensated;
    }),
  };
}
