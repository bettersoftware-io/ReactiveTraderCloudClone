import type { GroupviewPanelState, SerializedDockview } from "dockview";
import { Orientation } from "dockview";

const RTC_PANEL_COMPONENT = "rtc-panel";

export type DockSeedNode =
  | {
      readonly kind: "split";
      readonly dir: "row" | "column";
      readonly children: readonly DockSeedNode[];
      readonly sizes: readonly number[];
      /** Per-child pixel extent along the split axis that WINS over the
       * child's `sizes` fraction (the in-house engine's `fixedPx`: a cell
       * that never grows or shrinks). `undefined` holes fall back to the
       * fraction. */
      readonly fixedPx?: readonly (number | undefined)[];
      /** Per-child DESIGN pixel extent along the split axis (the in-house
       * engine's `initialPx` — a rail's prototype-measured default width,
       * still user-resizable afterwards). Honoured exactly like `fixedPx`
       * at seed time; `fixedPx` wins where both are set. */
      readonly initialPx?: readonly (number | undefined)[];
    }
  | { readonly kind: "panel"; readonly panelId: string };

export interface SeedConversionOptions {
  /** The dockview theme's `gap` (px between sibling groups), when one is in
   * force. Dockview implements the gap by shaving `gap × (n − 1) / n` off
   * each of a split's `n` children at RENDER time while keeping the model
   * sizes summing to the full extent — so a seed that wants a 360px rail on
   * screen must serialise the rail as 360 + that share. Passing the gap here
   * applies exactly that compensation, so pinned pixels and fractions alike
   * describe what the user SEES. Default 0: no compensation. */
  readonly gap?: number;
}

interface ConversionState {
  groupCounter: number;
  panels: Record<string, GroupviewPanelState>;
  gap: number;
}

interface SplitDiscriminant {
  readonly kind: "split";
}

type SeedSplit = Extract<DockSeedNode, SplitDiscriminant>;
// GroupPanelViewState (the grid leaf's `data` shape: views/activeView/id) is
// an internal dockview-core type not re-exported from the package root —
// pull the same type through SerializedDockview's own field instead of
// naming it directly. SerializedGridObject<T> is self-recursive (a branch's
// `data` is `T | SerializedGridObject<T>[]`), so the root field's type
// already covers every nested node.
type GridNode = SerializedDockview["grid"]["root"];

/** One child of a (flattened) split: its node, its fraction of the split's
 * extent, and — when the seed pins it — its exact pixel extent instead. */
interface SplitEntry {
  readonly node: DockSeedNode;
  readonly fraction: number;
  readonly px: number | undefined;
}

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
 *
 * Pixel-pinned children (`fixedPx` / `initialPx`) take exactly their pixels;
 * the remaining extent is shared among the fraction-sized siblings in
 * proportion to their `sizes` — so a 360px design rail opens at 360px in
 * dockview exactly as it does in the in-house engine, instead of at whatever
 * its nominal fraction happens to resolve to. Should the pinned pixels
 * exceed the extent, the pins are dropped for that split and every child
 * falls back to its fraction (a layout that fits beats one that overflows).
 */
export function toSerializedDockview(
  seed: DockSeedNode,
  width: number,
  height: number,
  options?: SeedConversionOptions,
): SerializedDockview {
  const orientation =
    seed.kind === "split" && seed.dir === "column"
      ? Orientation.VERTICAL
      : Orientation.HORIZONTAL;

  const state: ConversionState = {
    groupCounter: 0,
    panels: {},
    gap: options?.gap ?? 0,
  };
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
  // Rendered extents share what is left once the gaps are taken out; each
  // model size then carries its equal share of those gaps back, which is
  // precisely what dockview's splitview subtracts again at layout time
  // (`marginReducedSize = margin × sashCount / n`).
  const gapTotal = state.gap * Math.max(0, entries.length - 1);
  const gapShare = entries.length > 0 ? gapTotal / entries.length : 0;
  const rendered = allocateExtent(entries, extent - gapTotal);

  const children: GridNode[] = [];
  rendered.forEach(({ node: child, size }) => {
    const childWidth = node.dir === "row" ? size : width;
    const childHeight = node.dir === "row" ? height : size;
    const converted = convertNode(child, childWidth, childHeight, state);
    children.push({ ...converted, size: size + gapShare });
  });

  return { type: "branch", data: children };
}

/**
 * Turns a split's entries into integer pixel sizes summing exactly to
 * `extent`. Pinned entries take their pixels verbatim; the free remainder is
 * divided among the fraction-sized entries pro rata (their fractions are
 * renormalised among themselves, so the pinned siblings' nominal fractions
 * do not distort the share), and the LAST fraction-sized entry absorbs the
 * rounding residue so the sum is exact. With no pins this is the plain
 * fraction split it always was.
 */
function allocateExtent(
  entries: readonly SplitEntry[],
  extent: number,
): Array<{ node: DockSeedNode; size: number }> {
  const pinnedTotal = entries.reduce((sum, entry) => {
    return sum + (entry.px ?? 0);
  }, 0);
  const pinsFit = pinnedTotal <= extent;
  const isFree = (entry: SplitEntry): boolean => {
    return !pinsFit || entry.px === undefined;
  };
  const freeExtent = pinsFit ? extent - pinnedTotal : extent;
  const freeFractionTotal = entries.reduce((sum, entry) => {
    return isFree(entry) ? sum + entry.fraction : sum;
  }, 0);
  const lastFreeIndex = entries.reduce((last, entry, index) => {
    return isFree(entry) ? index : last;
  }, -1);

  let consumed = 0;
  return entries.map((entry, index) => {
    let size: number;

    if (!isFree(entry)) {
      size = entry.px ?? 0;
    } else if (index === lastFreeIndex) {
      size = extent - consumed - remainingPinned(entries, index, pinsFit);
    } else {
      size =
        freeFractionTotal > 0
          ? Math.round((entry.fraction / freeFractionTotal) * freeExtent)
          : 0;
    }

    consumed += size;
    return { node: entry.node, size };
  });
}

/** Pixels still owed to pinned entries AFTER `index` — what the last free
 * entry must leave unclaimed so those pins keep their exact extents. */
function remainingPinned(
  entries: readonly SplitEntry[],
  index: number,
  pinsFit: boolean,
): number {
  if (!pinsFit) {
    return 0;
  }

  return entries.slice(index + 1).reduce((sum, entry) => {
    return sum + (entry.px ?? 0);
  }, 0);
}

/**
 * Flattens a same-direction child split into its parent's entry list — a
 * `row` split whose child is itself a `row` split contributes that child's
 * grandchildren directly (scaled by the child's own fraction of the parent),
 * rather than nesting a redundant single-axis branch inside another.
 * `parentFraction` is this node's own share of ITS parent (1 at the root).
 * A pinned pixel extent belongs to the entry it is declared on; a nested
 * same-direction split's own pin (rather than its children's) has no
 * per-child meaning once spliced and is dropped.
 */
function flattenSplit(
  node: SeedSplit,
  parentFraction: number,
): SplitEntry[] {
  const entries: SplitEntry[] = [];
  node.children.forEach((child, index) => {
    const fraction = (node.sizes[index] ?? 0) * parentFraction;

    if (child.kind === "split" && child.dir === node.dir) {
      entries.push(...flattenSplit(child, fraction));
    } else {
      entries.push({
        node: child,
        fraction,
        px: node.fixedPx?.[index] ?? node.initialPx?.[index],
      });
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
