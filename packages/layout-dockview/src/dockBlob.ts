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
