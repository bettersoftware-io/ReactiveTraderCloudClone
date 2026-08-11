import type { GroupviewPanelState, SerializedDockview } from "dockview-core";
import { Orientation } from "dockview-core";

const RTC_PANEL_COMPONENT = "rtc-panel";

export type DockSeedNode =
  | {
      readonly kind: "split";
      readonly dir: "row" | "column";
      readonly children: readonly DockSeedNode[];
      readonly sizes: readonly number[];
    }
  | { readonly kind: "panel"; readonly panelId: string };

interface ConversionState {
  groupCounter: number;
  panels: Record<string, GroupviewPanelState>;
}

type SeedSplit = Extract<DockSeedNode, { kind: "split" }>;
// GroupPanelViewState (the grid leaf's `data` shape: views/activeView/id) is
// an internal dockview-core type not re-exported from the package root —
// pull the same type through SerializedDockview's own field instead of
// naming it directly. SerializedGridObject<T> is self-recursive (a branch's
// `data` is `T | SerializedGridObject<T>[]`), so the root field's type
// already covers every nested node.
type GridNode = SerializedDockview["grid"]["root"];

/**
 * Converts the app's seed-tree layout description into Dockview's
 * `SerializedDockview`, ready for `DockviewApi.fromJSON`. Deterministic and
 * DOM-free — walks the tree once, carrying the pixel extent along the
 * current split's axis (row divides width, column divides height).
 *
 * A child split sharing its parent's `dir` is flattened into the parent
 * (its children/sizes spliced in, scaled to the parent's fraction) because
 * Dockview's own grid branches alternate orientation implicitly — a nested
 * same-direction branch would silently render as a redundant single-child
 * branch instead of a genuine subdivision.
 */
export function toSerializedDockview(
  seed: DockSeedNode,
  width: number,
  height: number,
): SerializedDockview {
  const orientation =
    seed.kind === "split" && seed.dir === "column"
      ? Orientation.VERTICAL
      : Orientation.HORIZONTAL;

  const state: ConversionState = { groupCounter: 0, panels: {} };
  const root = convertNode(seed, width, height, state);

  return {
    grid: { root, width, height, orientation },
    panels: state.panels,
  };
}

function convertNode(
  node: DockSeedNode,
  width: number,
  height: number,
  state: ConversionState,
): GridNode {
  if (node.kind === "panel") {
    return convertLeaf(node.panelId, state);
  }
  return convertSplit(node, width, height, state);
}

function convertSplit(
  node: SeedSplit,
  width: number,
  height: number,
  state: ConversionState,
): GridNode {
  const extent = node.dir === "row" ? width : height;
  const entries = flattenSplit(node, 1);

  const children: GridNode[] = [];
  let consumed = 0;
  entries.forEach(([child, fraction], index) => {
    const isLast = index === entries.length - 1;
    const size = isLast ? extent - consumed : Math.round(fraction * extent);
    consumed += size;

    const childWidth = node.dir === "row" ? size : width;
    const childHeight = node.dir === "row" ? height : size;
    const converted = convertNode(child, childWidth, childHeight, state);
    children.push({ ...converted, size });
  });

  return { type: "branch", data: children };
}

/**
 * Flattens a same-direction child split into its parent's entry list — a
 * `row` split whose child is itself a `row` split contributes that child's
 * grandchildren directly (scaled by the child's own fraction of the parent),
 * rather than nesting a redundant single-axis branch inside another.
 * `parentFraction` is this node's own share of ITS parent (1 at the root).
 */
function flattenSplit(
  node: SeedSplit,
  parentFraction: number,
): Array<[DockSeedNode, number]> {
  const entries: Array<[DockSeedNode, number]> = [];
  node.children.forEach((child, index) => {
    const fraction = (node.sizes[index] ?? 0) * parentFraction;
    if (child.kind === "split" && child.dir === node.dir) {
      entries.push(...flattenSplit(child, fraction));
    } else {
      entries.push([child, fraction]);
    }
  });
  return entries;
}

function convertLeaf(panelId: string, state: ConversionState): GridNode {
  state.groupCounter += 1;
  const groupId = `group-${state.groupCounter}`;

  state.panels[panelId] = {
    id: panelId,
    contentComponent: RTC_PANEL_COMPONENT,
    title: panelId,
  };

  return {
    type: "leaf",
    data: {
      id: groupId,
      views: [panelId],
      activeView: panelId,
    },
  };
}
