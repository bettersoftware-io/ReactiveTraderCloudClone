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

/** A design-width pin the engine must HOLD after mounting: the in-house
 * engine renders a `fixedPx`/`initialPx` cell at `flex: 0 0 <px>` — the cell
 * keeps its design extent through every viewport resize while the fraction
 * siblings absorb the delta — whereas dockview rescales every child
 * proportionally, so the seed's exact pixel allocation drifts on the first
 * window resize. The engine turns each pin into min=max constraints on the
 * pinned child's groups (all of them, for a rail split: a branch's constraint
 * on its orthogonal axis is the meet of its children's) and releases them on
 * the first sash drag in the declaring split, mirroring in-house's "the first
 * drag converts the split to plain fractions". */
export interface DockDesignPin {
  /** Every panel under the pinned child — one id for a panel child, all of a
   * rail split's panels for a nested-split child. */
  readonly panelIds: readonly string[];
  /** The design extent, in rendered pixels (what the user sees). */
  readonly px: number;
  /** The dimension the declaring split divides: a row divides width. */
  readonly axis: "width" | "height";
}

export interface SeedConversion {
  readonly serialized: SerializedDockview;
  readonly pins: readonly DockDesignPin[];
}

interface ConversionState {
  groupCounter: number;
  panels: Record<string, GroupviewPanelState>;
  gap: number;
  pins: DockDesignPin[];
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

/** A split child with its final integer pixel size along the split axis. */
interface AllocatedEntry {
  readonly node: DockSeedNode;
  readonly size: number;
}

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
  return convertSeed(seed, width, height, options).serialized;
}

/** {@link toSerializedDockview} plus the {@link DockDesignPin}s the layout
 * opened with — the engine applies these as live constraints after
 * `fromJSON`. A split whose pins did not fit its extent contributes none
 * (its children fell back to fractions), and a nested-split pin whose
 * subtree contains a split of the SAME direction as the declarer is dropped
 * too: its leaf groups would SHARE the pinned extent along that axis, which
 * a per-group constraint cannot express. */
export function convertSeed(
  seed: DockSeedNode,
  width: number,
  height: number,
  options?: SeedConversionOptions,
): SeedConversion {
  const orientation =
    seed.kind === "split" && seed.dir === "column"
      ? Orientation.VERTICAL
      : Orientation.HORIZONTAL;

  const state: ConversionState = {
    groupCounter: 0,
    panels: {},
    gap: options?.gap ?? 0,
    pins: [],
  };

  // dockview's `fromJSON` rejects a grid whose root is a leaf ("root must be
  // of type branch" — verified against 7.0.4, and it threw for real on the
  // single-panel Admin tab), so a lone panel is wrapped in a one-child
  // branch spanning the whole extent. One child means no gap share to
  // compensate, whichever axis the root orientation picks.
  const root =
    seed.kind === "panel"
      ? {
          type: "branch" as const,
          data: [{ ...convertLeaf(seed.panelId, state), size: width }],
        }
      : convertNode(seed, width, height, state);

  return {
    serialized: {
      grid: { root, width, height, orientation },
      panels: state.panels,
    },
    pins: state.pins,
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
  collectDesignPins(node.dir, entries, extent - gapTotal, state.pins);

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
): AllocatedEntry[] {
  const pinsFit = pinsFitIn(entries, extent);

  function isFree(entry: SplitEntry): boolean {
    return !pinsFit || entry.px === undefined;
  }

  const freeExtent = pinsFit ? extent - pinnedTotalOf(entries) : extent;
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

/** The shared fit rule: pins apply only when their pixels all fit the
 * split's (gap-reduced) extent — {@link allocateExtent} falls back to plain
 * fractions otherwise, and pin collection must agree with that fallback. */
function pinsFitIn(entries: readonly SplitEntry[], extent: number): boolean {
  return pinnedTotalOf(entries) <= extent;
}

function pinnedTotalOf(entries: readonly SplitEntry[]): number {
  return entries.reduce((sum, entry) => {
    return sum + (entry.px ?? 0);
  }, 0);
}

/** Records the {@link DockDesignPin}s this split declares, skipping the whole
 * split when its pins did not fit (the allocation fell back to fractions) and
 * skipping a nested-split entry whose subtree contains a split running along
 * the DECLARING axis — its leaf groups would share the pinned extent, which a
 * per-group min=max constraint cannot express. */
function collectDesignPins(
  dir: "row" | "column",
  entries: readonly SplitEntry[],
  extent: number,
  pins: DockDesignPin[],
): void {
  if (!pinsFitIn(entries, extent)) {
    return;
  }

  for (const entry of entries) {
    if (entry.px === undefined || containsDir(entry.node, dir)) {
      continue;
    }

    pins.push({
      panelIds: panelIdsUnder(entry.node),
      px: entry.px,
      axis: dir === "row" ? "width" : "height",
    });
  }
}

function containsDir(node: DockSeedNode, dir: "row" | "column"): boolean {
  if (node.kind === "panel") {
    return false;
  }

  return (
    node.dir === dir ||
    node.children.some((child) => {
      return containsDir(child, dir);
    })
  );
}

function panelIdsUnder(node: DockSeedNode): string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(panelIdsUnder);
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
function flattenSplit(node: SeedSplit, parentFraction: number): SplitEntry[] {
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
