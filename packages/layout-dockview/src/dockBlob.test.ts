import { createDockview } from "dockview";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DOCK_BLOB_VERSION,
  isCurrentDockBlob,
  withoutDynamicNodes,
  withoutFloatingGroups,
  withoutLockMarks,
  withoutPopoutGroups,
} from "#/dockBlob";
import { toSerializedDockview } from "#/dockSeed";

beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global patch
    (globalThis as any).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    };
  }
});

describe("isCurrentDockBlob", () => {
  it("accepts only a blob stamped with the current version", () => {
    function stamp(version: unknown): string {
      return JSON.stringify({ grid: {}, rtcBlobVersion: version });
    }

    expect(isCurrentDockBlob(stamp(DOCK_BLOB_VERSION))).toBe(true);
    expect(isCurrentDockBlob(stamp(DOCK_BLOB_VERSION - 1))).toBe(false);
    expect(isCurrentDockBlob(stamp(undefined))).toBe(false);
    expect(isCurrentDockBlob(stamp(String(DOCK_BLOB_VERSION)))).toBe(false);
  });

  it("rejects an absent, unparseable or non-object blob", () => {
    expect(isCurrentDockBlob(null)).toBe(false);
    expect(isCurrentDockBlob("{not json")).toBe(false);
    expect(isCurrentDockBlob("null")).toBe(false);
    expect(isCurrentDockBlob("7")).toBe(false);
  });

  it("is the version the layout engine stamps (3, the width-lock discard)", () => {
    expect(DOCK_BLOB_VERSION).toBe(3);
  });
});

describe("the gap-0 model", () => {
  it("round-trips a gap-0 layout byte-identically with no compensation", () => {
    // The gap-7 era needed compensateGap because dockview serialised the
    // SHAVED rendered sizes (the rail drifted 360 → 358 → 349 across
    // reloads uncompensated). With margin 0 the model is the render, so
    // toJSON → fromJSON is the identity — the whole correction layer gone.
    const api = mountDockview();
    api.layout(1000, 800);
    api.fromJSON(toSerializedDockview(RAIL, 1000, 800, { gap: 7 }));
    const before = sizesOf(api.toJSON().grid.root as SerializedNode);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      api.fromJSON(JSON.parse(JSON.stringify(api.toJSON())));
      expect(sizesOf(api.toJSON().grid.root as SerializedNode)).toEqual(before);
    }

    // And every model size is an integer — the half-pixel class is gone.
    for (const size of before) {
      expect(Number.isInteger(size)).toBe(true);
    }

    api.dispose();
  });
});

describe("withoutLockMarks (derived lock state never persists)", () => {
  it("strips locked from every leaf's data and leaves the rest untouched", () => {
    const serialized = {
      grid: {
        root: {
          type: "branch",
          data: [
            {
              type: "leaf",
              size: 367,
              data: {
                id: "g1",
                views: ["a"],
                activeView: "a",
                locked: "no-drop-target",
              },
            },
            {
              type: "branch",
              data: [
                {
                  type: "leaf",
                  size: 200,
                  data: {
                    id: "g2",
                    views: ["b"],
                    activeView: "b",
                    locked: true,
                  },
                },
              ],
            },
          ],
        },
      },
      panels: {},
    };

    const scrubbed = withoutLockMarks(serialized) as typeof serialized;
    const first = scrubbed.grid.root.data[0] as LeafDataCarrier;
    const nested = (scrubbed.grid.root.data[1] as BranchDataCarrier)
      .data[0] as LeafDataCarrier;

    expect("locked" in first.data).toBe(false);
    expect("locked" in nested.data).toBe(false);
    expect(first.data.views).toEqual(["a"]);
  });

  it("passes malformed input through unchanged", () => {
    expect(withoutLockMarks(null)).toBe(null);
    expect(withoutLockMarks("nope")).toBe("nope");
  });
});

describe("withoutDynamicNodes (partial net for an unrestorable dynamic leaf)", () => {
  it("removes one dynamic leaf, dropping its panels entry and its views entry", () => {
    const blob = createSingleLeafBlob([
      ["rates", 526],
      ["blotter", 273],
      ["panel-dyn-1", 367],
    ]);

    const scrubbed = JSON.parse(
      withoutDynamicNodes(blob, STATIC_IDS) ?? "null",
    );

    expect(scrubbed.panels).toEqual({
      rates: { id: "rates" },
      blotter: { id: "blotter" },
    });
    const leaves = (
      scrubbed.grid.root.data as { data: { views: string[] } }[]
    ).map((leaf) => {
      return leaf.data.views;
    });
    expect(leaves).toEqual([["rates"], ["blotter"]]);
    // the removed leaf's size (367) is donated to a survivor, not dropped —
    // the branch's children still sum to the pre-removal total (1166).
    const sizes = (scrubbed.grid.root.data as { size: number }[]).map(
      (leaf) => {
        return leaf.size;
      },
    );
    expect(sizes[0] + sizes[1]).toBe(526 + 273 + 367);
  });

  it("returns null for a static-only blob — nothing was dynamic", () => {
    const blob = createSingleLeafBlob([
      ["rates", 526],
      ["blotter", 273],
    ]);

    expect(withoutDynamicNodes(blob, STATIC_IDS)).toBeNull();
  });

  it("keeps a one-child root a branch — dockview rejects a leaf root", () => {
    // A single-panel seed tab (e.g. Admin) with one Jarvis-docked panel: the
    // root branch has exactly [static leaf, dynamic leaf]. Removing the
    // dynamic leaf must NOT collapse root down to a bare leaf — dockview's
    // own fromJSON rejects that shape outright ("root must be of type
    // branch"), which would otherwise force the whole tab to seed.
    const blob = createSingleLeafBlob([
      ["admin", 833],
      ["panel-dyn-1", 367],
    ]);

    const scrubbed = JSON.parse(withoutDynamicNodes(blob, ["admin"]) ?? "null");

    expect(scrubbed.panels).toEqual({ admin: { id: "admin" } });
    expect(scrubbed.grid.root.type).toBe("branch");
    expect(scrubbed.grid.root.data).toHaveLength(1);
    expect(scrubbed.grid.root.data[0].data.views).toEqual(["admin"]);
    // the removed leaf's freed size (367) is donated to the sole survivor —
    // the same donation rule as any other branch, not dropped on the floor.
    expect(scrubbed.grid.root.data[0].size).toBe(833 + 367);
  });

  it("returns null for garbage — unparseable, or missing grid/panels", () => {
    expect(withoutDynamicNodes("not json", STATIC_IDS)).toBeNull();
    expect(
      withoutDynamicNodes(JSON.stringify({ hello: 1 }), STATIC_IDS),
    ).toBeNull();
    expect(
      withoutDynamicNodes(JSON.stringify({ grid: {} }), STATIC_IDS),
    ).toBeNull();
    expect(
      withoutDynamicNodes(JSON.stringify({ panels: {} }), STATIC_IDS),
    ).toBeNull();
  });

  const STATIC_IDS = ["rates", "blotter"] as const;
});

describe("withoutPopoutGroups (pop-outs are session-scoped)", () => {
  // The fixtures ENCODE the shape a mid-popout save measured (2026-09-13
  // spike): the popped panels live under a top-level `popoutGroups` entry
  // while the main grid keeps a hidden placeholder leaf whose id is the
  // entry's `gridReferenceGroup`. jsdom cannot create this state itself —
  // its window.open is blocked — so the scrub is witnessed fixture-first,
  // then through a REAL fromJSON round-trip (a converter test that never
  // feeds dockview proves nothing).
  it("re-parents a single-group popout onto its hidden reference leaf and drops the key", () => {
    const scrubbed = withoutPopoutGroups(createPoppedBlob()) as PoppedBlobShape;

    expect("popoutGroups" in scrubbed).toBe(false);
    const reference = scrubbed.grid.root.data[1] as PoppedLeaf;
    expect(reference.data.views).toEqual(["fx-analytics"]);
    expect(reference.data.activeView).toBe("fx-analytics");
    expect("visible" in reference).toBe(false);
  });

  it("a scrubbed blob restores every panel docked in a real dockview (no extra group)", () => {
    const dock = mountDockview();
    dock.layout(1000, 800);

    dock.fromJSON(
      withoutPopoutGroups(createPoppedBlob()) as Parameters<
        typeof dock.fromJSON
      >[0],
    );

    expect(dock.groups.length).toBe(2);
    expect(dock.getPanel("rates")).toBeDefined();
    expect(dock.getPanel("fx-analytics")).toBeDefined();
    expect(
      dock.groups.every((group) => {
        return group.api.location.type === "grid";
      }),
    ).toBe(true);
  });

  it("passes malformed popoutGroups through untouched", () => {
    expect(withoutPopoutGroups({ popoutGroups: 42, grid: null })).toEqual({
      popoutGroups: 42,
      grid: null,
    });
    expect(withoutPopoutGroups(null)).toBe(null);
  });
});

describe("withoutFloatingGroups (a load-time retry only, never a save-time scrub)", () => {
  it("drops the floatingGroups key and leaves the grid untouched", () => {
    const blob = {
      grid: { root: { type: "leaf", data: { views: ["a"] } } },
      panels: {},
      floatingGroups: [{ data: {} }],
    };

    const scrubbed = withoutFloatingGroups(blob) as Record<string, unknown>;

    expect(scrubbed.floatingGroups).toBeUndefined();
    expect(scrubbed.grid).toEqual(blob.grid);
  });

  it("passes a blob with no floatingGroups key through untouched", () => {
    const blob = { grid: { root: { type: "leaf", data: { views: ["a"] } } } };

    expect(withoutFloatingGroups(blob)).toEqual(blob);
  });

  it("passes malformed input through untouched", () => {
    expect(withoutFloatingGroups(null)).toBe(null);
    expect(withoutFloatingGroups(42)).toBe(42);
  });
});

/** The measured mid-popout save: fx-analytics popped, its reference leaf
 * hidden in the main grid with empty views. */
function createPoppedBlob(): PoppedBlobShape {
  return {
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            size: 640,
            data: { id: "g1", views: ["rates"], activeView: "rates" },
          },
          {
            type: "leaf",
            size: 360,
            visible: false,
            data: { id: "gref", views: [] },
          },
        ],
      },
      width: 1000,
      height: 800,
      orientation: "HORIZONTAL",
    },
    panels: {
      rates: { id: "rates", contentComponent: "rtc-panel", title: "RATES" },
      "fx-analytics": {
        id: "fx-analytics",
        contentComponent: "rtc-panel",
        title: "ANALYTICS",
      },
    },
    popoutGroups: [
      {
        data: {
          id: "gpop",
          views: ["fx-analytics"],
          activeView: "fx-analytics",
        },
        gridReferenceGroup: "gref",
        position: null,
      },
    ],
  };
}

/** The popped fixture narrowed to what the scrub assertions walk. */
interface PoppedBlobShape {
  grid: {
    root: { type: "branch"; data: unknown[] };
    width: number;
    height: number;
    orientation: string;
  };
  panels: Record<string, Record<string, unknown>>;
  popoutGroups?: unknown;
}

/** A leaf of the popped fixture, views and visibility readable. */
interface PoppedLeaf {
  visible?: boolean;
  data: { id: string; views: string[]; activeView?: string };
}

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
}

/** A serialized leaf narrowed to the group data the scrub assertions read. */
interface LeafDataCarrier {
  data: Record<string, unknown>;
}

/** A serialized branch narrowed to its children array. */
interface BranchDataCarrier {
  data: unknown[];
}

function sizesOf(node: SerializedNode): number[] {
  const own = node.size === undefined ? [] : [node.size];

  if (node.type !== "branch") {
    return own;
  }

  return [
    ...own,
    ...(node.data as SerializedNode[]).flatMap((child) => {
      return sizesOf(child);
    }),
  ];
}

function mountDockview(): ReturnType<typeof createDockview> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  return createDockview(container, {
    createComponent: () => {
      return { element: document.createElement("div"), init: () => {} };
    },
    theme: { name: "t", className: "t" },
  });
}

const RAIL = {
  kind: "split",
  dir: "row",
  sizes: [0.73, 0.27],
  initialPx: [undefined, 360],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.66, 0.34],
      children: [
        { kind: "panel", panelId: "rates" },
        { kind: "panel", panelId: "blotter" },
      ],
    },
    { kind: "panel", panelId: "rail" },
  ],
} as const;

/** A one-branch blob whose root holds one single-view leaf per entry, in
 * order — `[panelId, size]`. Both `panels` and each leaf's `g-<panelId>`
 * group id are DERIVED, so a case writes only what it actually varies: which
 * panels, at which sizes. `withoutDynamicNodes` reads `panels` and each
 * leaf's `views`, never the group id, so deriving that id uniformly is
 * behaviour-neutral (the cases' own assertions are the witness). */
function createSingleLeafBlob(
  leaves: readonly (readonly [string, number])[],
): string {
  return JSON.stringify({
    grid: {
      root: {
        type: "branch",
        data: leaves.map(([id, size]) => {
          return {
            type: "leaf",
            size,
            data: { id: `g-${id}`, views: [id], activeView: id },
          };
        }),
      },
    },
    panels: Object.fromEntries(
      leaves.map(([id]) => {
        return [id, { id }];
      }),
    ),
  });
}
