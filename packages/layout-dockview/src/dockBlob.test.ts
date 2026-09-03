import { createDockview } from "dockview";
import { beforeAll, describe, expect, it } from "vitest";

import { DOCK_BLOB_VERSION, migrateDockBlob } from "#/dockBlob";
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

describe("migrateDockBlob", () => {
  it("returns a current-version blob untouched", () => {
    const blob = { ...legacyRailBlob(), rtcBlobVersion: DOCK_BLOB_VERSION };
    expect(migrateDockBlob(blob, 7)).toBe(blob);
  });

  it("lifts each branch child from card + share(n) to card + gap, per that branch's own child count", () => {
    const migrated = migrateDockBlob(legacyRailBlob(), 7) as MigratedGridBlob;

    // Every legacy size was card + 3.5 (all branches here have 2 children);
    // the gap-0 model is card + 7, so each size moves by +gap/n = +3.5:
    // root children 636.5/363.5 → 640/367, column children 526.5/273.5 →
    // 530/277. The sums grow by exactly one gap per branch — the extent the
    // root padding hands back (10px → 6.5px per side).
    expect(sizesOf(migrated.grid.root)).toEqual([640, 530, 277, 367]);
  });

  it("lifts the strip sidecar's record and flip sizes from card to model units, leaving the pins alone", () => {
    const legacy = {
      ...legacyRailBlob(),
      rtcStripGeometry: {
        records: { rail: { size: 300 } },
        flips: [{ panelIds: ["rates", "blotter"], size: 250 }],
      },
      rtcDesignPins: [{ panelIds: ["rail"], px: 360, axis: "width" }],
    };

    const migrated = migrateDockBlob(legacy, 7) as Record<string, unknown>;

    expect(migrated.rtcStripGeometry).toEqual({
      records: { rail: { size: 307 } },
      flips: [{ panelIds: ["rates", "blotter"], size: 257 }],
    });
    // Pins persist the PUBLIC design width (what the user sees) in both
    // eras — the engine adds the gap when it clamps, so no migration.
    expect(migrated.rtcDesignPins).toEqual(legacy.rtcDesignPins);
  });

  it("passes malformed input through unharmed", () => {
    expect(migrateDockBlob(null, 7)).toBeNull();
    expect(migrateDockBlob("nope", 7)).toBe("nope");
    expect(migrateDockBlob({ hello: 1 }, 7)).toEqual({ hello: 1 });
    expect(migrateDockBlob({ grid: { root: { type: "leaf" } } }, 7)).toEqual({
      grid: { root: { type: "leaf" } },
    });
  });

  it("renders a migrated legacy blob's rail at its design width in a gap-0 dockview", () => {
    // The migrated sums carry one extra gap per branch — exactly what the
    // root padding change frees (10px → 6.5px per side), so the container
    // is 7px bigger on both axes.
    const api = mountDockview();
    api.layout(1007, 807);
    const migrated = migrateDockBlob(legacyRailBlob(), 7);
    api.fromJSON(migrated as Parameters<typeof api.fromJSON>[0]);

    // Model = card + 7: the 360px design rail is the 367 view, and with no
    // theme gap the model IS what dockview reports — no flooring, no share.
    expect(api.getGroup("g-rail")?.api.width).toBe(367);
    api.dispose();
  });

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

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
}

/** The migrated blob narrowed to the grid the assertions walk. */
interface MigratedGridBlob {
  grid: { root: SerializedNode };
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

/** A gap-7-era blob for RAIL at 1000×800, exactly as the old serialisation
 * wrote it: each branch child at `card + gap × (n − 1) / n` — root children
 * at card + 3.5 (the old allocator shared 993 rendered px: main 633, rail
 * 360), the nested column's at card + 3.5 of 793 (rates 523, blotter 270).
 * No `rtcBlobVersion` — the stamp is what marks a blob as already gap-0. */
function legacyRailBlob(): Record<string, unknown> {
  function leaf(id: string, size: number): Record<string, unknown> {
    return {
      type: "leaf",
      size,
      data: { id: `g-${id}`, views: [id], activeView: id },
    };
  }

  return {
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            size: 636.5,
            data: [leaf("rates", 526.5), leaf("blotter", 273.5)],
          },
          leaf("rail", 363.5),
        ],
      },
      width: 1000,
      height: 800,
      orientation: "HORIZONTAL",
    },
    panels: {
      rates: { id: "rates", contentComponent: "rtc-panel", title: "rates" },
      blotter: {
        id: "blotter",
        contentComponent: "rtc-panel",
        title: "blotter",
      },
      rail: { id: "rail", contentComponent: "rtc-panel", title: "rail" },
    },
  };
}
