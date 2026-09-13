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

/** One `popoutGroups` entry of a mid-popout save, loosely — the measured
 * dockview 7.0.4 shape: `data` for the single-group form, `grid` for the
 * multi-group form (mutually exclusive), `gridReferenceGroup` naming the
 * hidden placeholder leaf the panels came from. */
interface UnverifiedPopoutGroup {
  readonly data?: unknown;
  readonly grid?: unknown;
  readonly gridReferenceGroup?: unknown;
}

/** A group's serialized view state, loosely — views + the active one. */
interface UnverifiedViewState {
  readonly views?: unknown;
  readonly activeView?: unknown;
}

/** A blob that MAY carry popout state, loosely. */
interface PopoutCarrier {
  readonly grid?: unknown;
  readonly popoutGroups?: unknown;
}

/**
 * Re-parents every popped-out group's panels back onto the hidden reference
 * leaf the main grid kept for them, and drops the `popoutGroups` key —
 * pop-outs are SESSION-scoped: a mid-popout save must restore fully docked,
 * in the exact slot the group left, not through dockview's blocked-popup
 * fallback (which docks the panels but into an EXTRA group, with a
 * console.error). The `withoutLockMarks` precedent, structural this time.
 *
 * An entry that cannot be re-parented (no reference id, or its leaf is
 * gone) is KEPT under `popoutGroups` so dockview's own fallback still
 * recovers its panels; anything malformed passes through untouched —
 * `loadBlobOrSeed`'s fall-back-to-seed net stays the outer safety.
 */
export function withoutPopoutGroups(serialized: unknown): unknown {
  if (typeof serialized !== "object" || serialized === null) {
    return serialized;
  }

  const blob = serialized as PopoutCarrier;

  if (
    !Array.isArray(blob.popoutGroups) ||
    typeof blob.grid !== "object" ||
    blob.grid === null
  ) {
    return serialized;
  }

  let root = (blob.grid as UnverifiedGrid).root;
  const kept: unknown[] = [];

  for (const entry of blob.popoutGroups) {
    const reparented = rootWithPopoutReparented(root, entry);

    if (reparented === null) {
      kept.push(entry);
    } else {
      root = reparented;
    }
  }

  const scrubbed: Record<string, unknown> = {
    ...blob,
    grid: { ...blob.grid, root },
  };

  if (kept.length > 0) {
    scrubbed.popoutGroups = kept;
  } else {
    delete scrubbed.popoutGroups;
  }

  return scrubbed;
}

/** The entry's panels, flattened in order: the single-group form's `data`
 * views, or every leaf's views of the multi-group form's nested grid. */
function poppedViewsOf(
  entry: UnverifiedPopoutGroup,
): { views: readonly string[]; activeView: string | undefined } | null {
  const states: UnverifiedViewState[] = [];

  if (typeof entry.data === "object" && entry.data !== null) {
    states.push(entry.data as UnverifiedViewState);
  } else if (typeof entry.grid === "object" && entry.grid !== null) {
    collectLeafStates((entry.grid as UnverifiedGrid).root, states);
  }

  const views = states.flatMap((state) => {
    return Array.isArray(state.views)
      ? state.views.filter((view): view is string => {
          return typeof view === "string";
        })
      : [];
  });

  if (views.length === 0) {
    return null;
  }

  const activeView = states
    .map((state) => {
      return state.activeView;
    })
    .find((view): view is string => {
      return typeof view === "string";
    });

  return { views, activeView };
}

function collectLeafStates(node: unknown, into: UnverifiedViewState[]): void {
  if (typeof node !== "object" || node === null) {
    return;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type === "leaf" && typeof data === "object" && data !== null) {
    into.push(data as UnverifiedViewState);
    return;
  }

  if (type === "branch" && Array.isArray(data)) {
    for (const child of data) {
      collectLeafStates(child, into);
    }
  }
}

/** The grid root with `entry`'s panels re-parented onto its reference leaf
 * (views/activeView replaced, the hidden mark cleared) — or null when the
 * entry names no reference, holds no views, or the leaf is gone. */
function rootWithPopoutReparented(
  root: unknown,
  entry: unknown,
): unknown | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const popout = entry as UnverifiedPopoutGroup;
  const referenceId = popout.gridReferenceGroup;
  const popped = poppedViewsOf(popout);

  if (typeof referenceId !== "string" || popped === null) {
    return null;
  }

  return nodeWithLeafRefilled(root, referenceId, popped);
}

function nodeWithLeafRefilled(
  node: unknown,
  referenceId: string,
  popped: { views: readonly string[]; activeView: string | undefined },
): unknown | null {
  if (typeof node !== "object" || node === null) {
    return null;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type === "branch" && Array.isArray(data)) {
    for (let index = 0; index < data.length; index += 1) {
      const refilled = nodeWithLeafRefilled(data[index], referenceId, popped);

      if (refilled !== null) {
        const children = [...data];
        children[index] = refilled;

        return { ...node, data: children };
      }
    }

    return null;
  }

  if (type !== "leaf" || typeof data === "object" === false || data === null) {
    return null;
  }

  const state = data as Record<string, unknown>;

  if (state.id !== referenceId) {
    return null;
  }

  const { visible: _shown, ...rest } = node as Record<string, unknown>;

  return {
    ...rest,
    data: {
      ...state,
      views: [...popped.views],
      ...(popped.activeView === undefined
        ? {}
        : { activeView: popped.activeView }),
    },
  };
}
