/** The blob format a save stamps as `rtcBlobVersion`. Version 2 is the
 * gap-0 model: dockview's theme carries NO gap, the in-house 7px gutter is a
 * CSS inset on every leaf view (3.5px per side — `dockview-hud.css`), and
 * every serialised size is the MODEL size = the visible card + one gutter.
 * Model and render being the same number is the whole point: dockview's
 * gap-7 era shaved `gap × (n − 1) / n` off each of a branch's `n` children
 * at layout time AND serialised those shaved sizes, which forced a
 * compensation layer (seed shares, serialise-time re-adding, set-and-measure
 * corrections) and put every card edge on a half pixel. */
export const DOCK_BLOB_VERSION = 2;

/** A parsed blob that MAY carry the version stamp, unverified. */
interface VersionCarrier {
  readonly rtcBlobVersion?: unknown;
}

/** One grid node of a parsed blob, loosely — the blob crosses localStorage,
 * so nothing about its shape is trusted beyond what is checked. */
interface UnverifiedGridNode {
  readonly type?: unknown;
  readonly data?: unknown;
  readonly size?: unknown;
}

/** The grid of a parsed blob, loosely. */
interface UnverifiedGrid {
  readonly root?: unknown;
}

/** A parsed blob's migratable fields, loosely. */
interface UnverifiedBlob {
  readonly grid?: unknown;
  readonly rtcStripGeometry?: unknown;
}

/**
 * Lifts a gap-7-era blob (no `rtcBlobVersion` stamp) into the gap-0 model,
 * returning a stamped-current blob untouched. Two unit changes:
 *
 * - Grid sizes: a legacy branch child was `card + gap × (n − 1) / n` (its
 *   branch's own child count `n`); the gap-0 model is `card + gap`, so each
 *   child moves by `+gap / n`. Each branch's children then sum to one gap
 *   MORE than before — exactly the extent the root-padding change frees
 *   (10px → 6.5px per side), so a migrated blob restored into the new
 *   container lands every card where it was.
 * - The `rtcStripGeometry` sidecar's record/flip sizes were rendered (card)
 *   units; the gap-0 engine works in model units throughout, so they move
 *   by `+gap`. `rtcDesignPins` persist the PUBLIC design width in both eras
 *   (the engine adds the gap at clamp time) and are not touched.
 *
 * Anything malformed passes through unchanged — `loadBlobOrSeed`'s
 * fall-back-to-seed handling stays the safety net.
 */
export function migrateDockBlob(parsed: unknown, gap: number): unknown {
  if (typeof parsed !== "object" || parsed === null) {
    return parsed;
  }

  if ((parsed as VersionCarrier).rtcBlobVersion === DOCK_BLOB_VERSION) {
    return parsed;
  }

  const blob = parsed as UnverifiedBlob;
  const migrated: Record<string, unknown> = { ...blob };
  const grid = blob.grid;

  if (typeof grid === "object" && grid !== null) {
    migrated.grid = {
      ...grid,
      root: migrateNode((grid as UnverifiedGrid).root, gap),
    };
  }

  const sidecar = migrateStripGeometry(blob.rtcStripGeometry, gap);

  if (sidecar !== undefined) {
    migrated.rtcStripGeometry = sidecar;
  }

  return migrated;
}

function migrateNode(node: unknown, gap: number): unknown {
  if (typeof node !== "object" || node === null) {
    return node;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type !== "branch" || !Array.isArray(data)) {
    return node;
  }

  const lift = gap / Math.max(1, data.length);

  return {
    ...node,
    data: data.map((child: unknown) => {
      const migrated = migrateNode(child, gap);
      const size = (migrated as UnverifiedGridNode | null)?.size;

      return typeof migrated === "object" &&
        migrated !== null &&
        typeof size === "number"
        ? { ...migrated, size: size + lift }
        : migrated;
    }),
  };
}

/** Removes every leaf's `locked` mark from a serialized grid. Lock state is
 * DERIVED (a group is locked iff it currently renders as a strip — audit
 * S1), so persisting it would let a blob re-impose a stale lock on a layout
 * whose collapse state changed while this engine was not looking. The load
 * path normalises to unlocked and the strip replay re-derives. */
export function withoutLockMarks(serialized: unknown): unknown {
  if (typeof serialized !== "object" || serialized === null) {
    return serialized;
  }

  const blob = serialized as UnverifiedBlob;
  const grid = blob.grid;

  if (typeof grid !== "object" || grid === null) {
    return serialized;
  }

  return {
    ...blob,
    grid: { ...grid, root: nodeWithoutLock((grid as UnverifiedGrid).root) },
  };
}

function nodeWithoutLock(node: unknown): unknown {
  if (typeof node !== "object" || node === null) {
    return node;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type === "branch" && Array.isArray(data)) {
    return { ...node, data: data.map(nodeWithoutLock) };
  }

  if (type === "leaf" && typeof data === "object" && data !== null) {
    const { locked: _dropped, ...rest } = data as Record<string, unknown>;

    return { ...node, data: rest };
  }

  return node;
}

/** The strip sidecar's shape, loosely — see the engine's own validated
 * `stripGeometryIn`; migration only shifts numeric sizes and leaves the
 * validation to the load path. */
interface UnverifiedStripGeometry {
  readonly records?: unknown;
  readonly flips?: unknown;
}

interface UnverifiedSizeCarrier {
  readonly size?: unknown;
}

function migrateStripGeometry(raw: unknown, gap: number): unknown {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }

  const { records, flips } = raw as UnverifiedStripGeometry;
  const migrated: Record<string, unknown> = { ...raw };

  if (typeof records === "object" && records !== null) {
    migrated.records = Object.fromEntries(
      Object.entries(records).map(([panelId, entry]) => {
        return [panelId, liftSizeOf(entry, gap)];
      }),
    );
  }

  if (Array.isArray(flips)) {
    migrated.flips = flips.map((entry: unknown) => {
      return liftSizeOf(entry, gap);
    });
  }

  return migrated;
}

function liftSizeOf(entry: unknown, gap: number): unknown {
  if (typeof entry !== "object" || entry === null) {
    return entry;
  }

  const size = (entry as UnverifiedSizeCarrier).size;

  return typeof size === "number" ? { ...entry, size: size + gap } : entry;
}

/** A blob that MAY carry a `panels` dictionary, loosely. */
interface PanelsCarrier {
  readonly panels?: unknown;
}

/** One grid leaf's `data`, loosely — the tab ids it stacks and which one is
 * active. */
interface UnverifiedLeafData {
  readonly views?: unknown;
  readonly activeView?: unknown;
}

/** Mutable removal tally threaded through {@link removeDynamicViews} — a
 * plain boolean box rather than a return value, since a node's OWN return
 * (its possibly-scrubbed replacement, or `null` if it disappeared entirely)
 * already carries different meaning. */
interface RemovalTally {
  any: boolean;
}

/**
 * Strips every dynamic-panel node out of a serialized blob — the partial net
 * `loadBlobOrSeed` reaches for when a full `fromJSON` fails, so one
 * unrestorable Jarvis-docked panel does not degrade an otherwise-healthy
 * static arrangement all the way down to the seed.
 *
 * Pure (no dockview import): parses `blob`, drops every `panels` entry whose
 * id is not in `staticIds`, and walks `grid.root` removing any id NOT in
 * `staticIds` from each leaf's `views` — a leaf empties, it is dropped; a
 * branch left with exactly one surviving child collapses into that child
 * directly, so scrubbing never leaves a shape dockview would not itself have
 * produced. Membership is checked against `staticIds` directly, not against
 * the `panels` dictionary's own keys, so a leaf `views` entry with no
 * matching `panels` entry at all — an unrestorable node's other common
 * corrupt shape — is scrubbed exactly like one whose `panels` entry survived
 * but was malformed.
 *
 * Returns `null` — the caller's cue to fall straight to the seed — when
 * nothing was actually dynamic (a static-only blob, so nothing was removed),
 * or when the blob's shape is not one this can safely operate on
 * (unparseable JSON, or a missing/malformed `grid`/`panels`): it never
 * guesses at a shape it cannot verify.
 */
export function withoutDynamicNodes(
  blob: string,
  staticIds: readonly string[],
): string | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(blob);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const carrier = parsed as UnverifiedBlob & PanelsCarrier;
  const grid = carrier.grid;
  const panels = carrier.panels;

  if (
    typeof grid !== "object" ||
    grid === null ||
    typeof panels !== "object" ||
    panels === null
  ) {
    return null;
  }

  const staticSet = new Set(staticIds);
  const panelEntries = Object.entries(panels as Record<string, unknown>);
  const remainingPanelEntries = panelEntries.filter(([id]) => {
    return staticSet.has(id);
  });

  const tally: RemovalTally = {
    any: remainingPanelEntries.length !== panelEntries.length,
  };

  const root = removeDynamicViews(
    (grid as UnverifiedGrid).root,
    staticSet,
    tally,
  );

  if (!tally.any) {
    return null;
  }

  if (root === null) {
    return null;
  }

  return JSON.stringify({
    ...carrier,
    grid: { ...grid, root },
    panels: Object.fromEntries(remainingPanelEntries),
  });
}

/** A grid node that MAY carry a numeric `size` — every branch/leaf does in
 * practice, but this walks unverified input. */
interface UnverifiedSized {
  readonly size?: unknown;
}

function sizeOf(node: unknown): number {
  const size = (node as UnverifiedSized | null)?.size;

  return typeof size === "number" ? size : 0;
}

/** Removes every view id NOT in `staticIds` from one grid node's leaves,
 * recursively, marking `tally.any` the first time a view is actually
 * dropped. `null` means the node itself disappeared — an emptied leaf, or a
 * branch every child of which disappeared.
 *
 * A branch that loses a direct child donates that child's freed `size` to
 * the LARGEST surviving sibling rather than leaving every survivor's `size`
 * as-is (dockview's own deserializer falls back to redistributing a
 * mismatched branch EVENLY across every child once its children's sizes no
 * longer sum to the branch's own — exactly the failure mode this function
 * exists to avoid, since it would just as happily blow up a sibling's
 * deliberately-narrow strip, e.g., a panel a user had collapsed, as it would
 * a full-size one). Donating to the largest — presumed the main content
 * area, not a fixed/pinned/collapsed one — leaves every other survivor's own
 * `size` exactly as persisted.
 *
 * A branch left with exactly one surviving child collapses into that child
 * directly (rather than persisting as a single-child branch), inheriting the
 * DEAD branch's own `size` — the survivor's previous `size` was along the
 * dead branch's own (orthogonal) axis, not its parent's. */
function removeDynamicViews(
  node: unknown,
  staticIds: ReadonlySet<string>,
  tally: RemovalTally,
): unknown | null {
  if (typeof node !== "object" || node === null) {
    return node;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type === "branch" && Array.isArray(data)) {
    let freedSize = 0;
    const children = data
      .map((child: unknown) => {
        const result = removeDynamicViews(child, staticIds, tally);

        if (result === null) {
          freedSize += sizeOf(child);
        }

        return result;
      })
      .filter((child): child is NonNullable<typeof child> => {
        return child !== null;
      });

    if (children.length === 0) {
      return null;
    }

    if (children.length === 1) {
      const survivor = children[0];

      return typeof (node as UnverifiedSized).size === "number"
        ? { ...(survivor as object), size: (node as UnverifiedSized).size }
        : survivor;
    }

    if (freedSize > 0) {
      const sizes = children.map(sizeOf);
      const largestIndex = sizes.indexOf(Math.max(...sizes));
      const largest = children[largestIndex] as Record<string, unknown>;
      children[largestIndex] = {
        ...largest,
        size: sizeOf(largest) + freedSize,
      };
    }

    return { ...node, data: children };
  }

  if (type === "leaf") {
    const leafData = data as UnverifiedLeafData | undefined;

    if (
      typeof leafData !== "object" ||
      leafData === null ||
      !Array.isArray(leafData.views)
    ) {
      return node;
    }

    const views = leafData.views.filter((id: unknown) => {
      return typeof id !== "string" || staticIds.has(id);
    });

    if (views.length === leafData.views.length) {
      return node;
    }

    tally.any = true;

    if (views.length === 0) {
      return null;
    }

    const activeView =
      typeof leafData.activeView === "string" &&
      !staticIds.has(leafData.activeView)
        ? views[0]
        : leafData.activeView;

    return { ...node, data: { ...leafData, views, activeView } };
  }

  return node;
}
