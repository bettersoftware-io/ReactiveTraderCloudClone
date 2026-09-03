import { createDockview } from "dockview";
import { beforeAll, describe, expect, it } from "vitest";

import { convertSeed, toSerializedDockview } from "#/dockSeed";

// jsdom (as of the pinned Node/jsdom combo here) has no ResizeObserver;
// dockview-core's own unit tests run under jsdom with the same stub. Needed
// only by the round-trip describe block below, which mounts a real
// DockviewApi — the pure-conversion tests above never touch dockview-core.
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

const FX_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

// A `row` split whose first child is itself a `row` split — exercises the
// same-direction flattening path (flattenSplit), distinct from FX_LIKE above
// (whose nested split alternates row/column and so never flattens).
const NESTED_SAME_DIR = {
  kind: "split",
  dir: "row",
  sizes: [0.5, 0.5],
  children: [
    {
      kind: "split",
      dir: "row",
      sizes: [0.4, 0.6],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "b" },
      ],
    },
    { kind: "panel", panelId: "c" },
  ],
} as const;

describe("toSerializedDockview", () => {
  it("maps a nested row/column tree to a branch/leaf grid with px sizes", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);

    expect(s.grid.orientation).toBe("HORIZONTAL");
    expect(s.grid.width).toBe(1000);
    expect(s.grid.height).toBe(800);

    const root = s.grid.root as SerializedNode;
    expect(root.type).toBe("branch");
    const [left, right] = root.data as SerializedNode[];
    expect(left.type).toBe("branch");
    expect(left.size).toBe(750);
    expect(right.type).toBe("leaf");
    expect(right.size).toBe(250);

    const [top, bottom] = left.data as SerializedNode[];
    expect(top.size).toBe(480); // 0.6 × 800 (column axis = height)
    expect(bottom.size).toBe(320);

    expect(Object.keys(s.panels).sort()).toEqual([
      "fx-analytics",
      "fx-blotter",
      "fx-rates",
    ]);
    expect(s.panels["fx-rates"].contentComponent).toBe("rtc-panel");
  });

  it("maps a single-panel tree to a one-leaf BRANCH (a leaf root is rejected by dockview)", () => {
    const s = toSerializedDockview(
      { kind: "panel", panelId: "admin-dashboard" },
      640,
      480,
    );
    const root = s.grid.root as SerializedNode;
    expect(root.type).toBe("branch");
    const [leaf] = root.data as SerializedNode[];
    expect(leaf.type).toBe("leaf");
    expect(leaf.size).toBe(640);
    expect(Object.keys(s.panels)).toEqual(["admin-dashboard"]);
  });

  it("gives every leaf a unique group id and an activeView", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);
    const leaves = collectLeaves(s.grid.root as SerializedNode);
    const ids = leaves.map((l) => {
      return (l.data as LeafGroupId).id;
    });
    expect(new Set(ids).size).toBe(leaves.length);

    for (const leaf of leaves) {
      const data = leaf.data as LeafGroupView;
      expect(data.views).toContain(data.activeView);
    }
  });

  it("flattens a same-direction nested split into one branch with scaled sizes", () => {
    const s = toSerializedDockview(NESTED_SAME_DIR, 1000, 800);

    // The nested row's two children (0.4 / 0.6 of ITS parent's 0.5 share)
    // splice directly into the root branch instead of nesting a redundant
    // single-axis branch: root.data has 3 leaves, not [branch, leaf].
    const root = s.grid.root as SerializedNode;
    expect(root.type).toBe("branch");
    const children = root.data as SerializedNode[];
    expect(
      children.map((child) => {
        return child.type;
      }),
    ).toEqual(["leaf", "leaf", "leaf"]);

    // Fractions: a = 0.4 × 0.5 = 0.2, b = 0.6 × 0.5 = 0.3, c = 0.5 (unscaled,
    // sibling of the flattened split, not one of its children). c is last so
    // it takes the exact remainder rather than a rounded fraction.
    const [aLeaf, bLeaf, cLeaf] = children;
    expect(aLeaf.size).toBe(200);
    expect(bLeaf.size).toBe(300);
    expect(cLeaf.size).toBe(500);
    expect((aLeaf.size ?? 0) + (bLeaf.size ?? 0) + (cLeaf.size ?? 0)).toBe(
      1000,
    );

    expect(Object.keys(s.panels).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("toSerializedDockview × pixel pins", () => {
  // The FX default tree: a 360px design-width rail (initialPx) beside a
  // fraction-sized main column, exactly as createDefaultLayoutPort seeds it.
  const RAIL = {
    kind: "split",
    dir: "row",
    sizes: [0.73, 0.27],
    initialPx: [undefined, 360],
    children: [
      { kind: "panel", panelId: "main" },
      { kind: "panel", panelId: "rail" },
    ],
  } as const;

  it("gives an initialPx child exactly its pixels and the rest to the fraction-sized siblings", () => {
    const [main, rail] = (
      toSerializedDockview(RAIL, 1000, 800).grid.root as SerializedNode
    ).data as SerializedNode[];
    expect(rail.size).toBe(360);
    expect(main.size).toBe(640); // 1000 − 360, not 0.73 × 1000
  });

  it("lets fixedPx win over initialPx on the same child", () => {
    const both = { ...RAIL, fixedPx: [undefined, 300] } as const;
    const [main, rail] = (
      toSerializedDockview(both, 1000, 800).grid.root as SerializedNode
    ).data as SerializedNode[];
    expect(rail.size).toBe(300);
    expect(main.size).toBe(700);
  });

  it("renormalises the fractions among the free siblings only", () => {
    // Two free children at 0.5 / 0.25 (0.75 together) beside a 200px pin:
    // the 800px remainder splits 2:1, not 0.5 / 0.25 of 800.
    const three = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.25, 0.25],
      fixedPx: [undefined, undefined, 200],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "b" },
        { kind: "panel", panelId: "c" },
      ],
    } as const;

    const sizes = (
      (toSerializedDockview(three, 1000, 800).grid.root as SerializedNode)
        .data as SerializedNode[]
    ).map((n) => {
      return n.size;
    });
    expect(sizes).toEqual([533, 267, 200]);
  });

  it("drops the pins and falls back to fractions when they cannot fit", () => {
    const [main, rail] = (
      toSerializedDockview(RAIL, 300, 800).grid.root as SerializedNode
    ).data as SerializedNode[];
    expect(rail.size).toBe(81); // 300 − round(0.73 × 300)
    expect(main.size).toBe(219);
  });

  it("keeps a pin on a child that survives same-direction flattening", () => {
    const nested = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.5],
      children: [
        {
          kind: "split",
          dir: "row",
          sizes: [0.5, 0.5],
          initialPx: [100, undefined],
          children: [
            { kind: "panel", panelId: "a" },
            { kind: "panel", panelId: "b" },
          ],
        },
        { kind: "panel", panelId: "c" },
      ],
    } as const;

    const sizes = (
      (toSerializedDockview(nested, 1000, 800).grid.root as SerializedNode)
        .data as SerializedNode[]
    ).map((n) => {
      return n.size;
    });
    // a keeps its 100px; b (0.25) and c (0.5) share the remaining 900 at 1:2.
    expect(sizes).toEqual([100, 300, 600]);
  });

  it("lifts every child by one whole gap so the pinned pixels are the visible card", () => {
    // The gap-0 model: cards share the extent minus one gap per child
    // (each leaf view is inset half a gap per side in CSS), and a child's
    // MODEL size is its card + 7 — a constant, so integers stay integers.
    // Two children, gap 7: cards share 986, models sum back to 1000.
    const [main, rail] = (
      toSerializedDockview(RAIL, 1000, 800, { gap: 7 }).grid
        .root as SerializedNode
    ).data as SerializedNode[];
    expect(rail.size).toBe(367); // card 360 + one gap
    expect(main.size).toBe(633); // card (986 − 360) + one gap
    expect((rail.size ?? 0) + (main.size ?? 0)).toBe(1000);
  });
});

describe("convertSeed × design pins", () => {
  it("reports a panel child's pin with the split's dividing axis", () => {
    const RAIL = {
      kind: "split",
      dir: "row",
      sizes: [0.73, 0.27],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "main" },
        { kind: "panel", panelId: "rail" },
      ],
    } as const;

    expect(convertSeed(RAIL, 1000, 800).pins).toEqual([
      { panelIds: ["rail"], px: 360, axis: "width" },
    ]);
  });

  it("reports every panel of a pinned nested split", () => {
    const RAIL_SPLIT = {
      kind: "split",
      dir: "row",
      sizes: [0.75, 0.25],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "main" },
        {
          kind: "split",
          dir: "column",
          sizes: [0.5, 0.5],
          children: [
            { kind: "panel", panelId: "analytics" },
            { kind: "panel", panelId: "positions" },
          ],
        },
      ],
    } as const;

    expect(convertSeed(RAIL_SPLIT, 1000, 800).pins).toEqual([
      { panelIds: ["analytics", "positions"], px: 360, axis: "width" },
    ]);
  });

  it("maps a column's pin to the height axis", () => {
    const STACK = {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      fixedPx: [undefined, 200],
      children: [
        { kind: "panel", panelId: "top" },
        { kind: "panel", panelId: "dock" },
      ],
    } as const;

    expect(convertSeed(STACK, 1000, 800).pins).toEqual([
      { panelIds: ["dock"], px: 200, axis: "height" },
    ]);
  });

  it("reports no pins for a split whose pins do not fit", () => {
    const RAIL = {
      kind: "split",
      dir: "row",
      sizes: [0.73, 0.27],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "main" },
        { kind: "panel", panelId: "rail" },
      ],
    } as const;

    expect(convertSeed(RAIL, 300, 800).pins).toEqual([]);
  });

  it("drops a nested-split pin whose subtree splits along the declaring axis", () => {
    // The rail's own children would SHARE the 360px side by side — a
    // per-group min=max clamp cannot express that, so no pin is reported
    // (the seed still opens at 360; it just will not be held afterwards).
    const SIDE_BY_SIDE_RAIL = {
      kind: "split",
      dir: "row",
      sizes: [0.75, 0.25],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "main" },
        {
          kind: "split",
          dir: "column",
          sizes: [0.5, 0.5],
          children: [
            { kind: "panel", panelId: "a" },
            {
              kind: "split",
              dir: "row",
              sizes: [0.5, 0.5],
              children: [
                { kind: "panel", panelId: "b" },
                { kind: "panel", panelId: "c" },
              ],
            },
          ],
        },
      ],
    } as const;

    expect(convertSeed(SIDE_BY_SIDE_RAIL, 1000, 800).pins).toEqual([]);
  });

  it("keeps a flattened same-direction child's pin", () => {
    const NESTED = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.5],
      children: [
        {
          kind: "split",
          dir: "row",
          sizes: [0.5, 0.5],
          initialPx: [100, undefined],
          children: [
            { kind: "panel", panelId: "a" },
            { kind: "panel", panelId: "b" },
          ],
        },
        { kind: "panel", panelId: "c" },
      ],
    } as const;

    expect(convertSeed(NESTED, 1000, 800).pins).toEqual([
      { panelIds: ["a"], px: 100, axis: "width" },
    ]);
  });
});

describe("toSerializedDockview × dockview-core round trip", () => {
  it("honours the seed's proportions through a real fromJSON/toJSON cycle", () => {
    // Regression pin for a bug found in the live browser (drag-docking and
    // reload-persistence both worked, but the default seed's [0.75, 0.25] /
    // [0.6, 0.4] proportions rendered as an even ~50/50 split on both axes).
    // Root cause: dockview-core needs an explicit, real-dimensioned
    // `api.layout(width, height)` call BEFORE `fromJSON` restores a tree —
    // without one, a freshly-constructed grid is still at its 0×0
    // construction size, and every SplitView falls back to distributing
    // space EVENLY among children rather than honouring the `size` fields in
    // the restored JSON. Confirmed empirically: omitting the `api.layout()`
    // call below makes every leaf come back sized 100/100 regardless of
    // input ratio; with it, sizes land exactly on the requested split. This
    // is the exact mechanism `createDockEngine`'s own `api.layout(width,
    // height)` call — made right before restoring — exists to avoid.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const api = createDockview(container, {
      createComponent: () => {
        return {
          element: document.createElement("div"),
          init: () => {},
        };
      },
    });

    api.layout(1000, 800);
    api.fromJSON(toSerializedDockview(FX_LIKE, 1000, 800));

    const root = api.toJSON().grid.root as SerializedNode;
    const [left, right] = root.data as SerializedNode[];
    expect(left.size).toBe(750);
    expect(right.size).toBe(250);

    const [top, bottom] = left.data as SerializedNode[];
    expect(top.size).toBe(480);
    expect(bottom.size).toBe(320);

    api.dispose();
  });

  it("restores a single-panel seed (the Admin tab) instead of throwing", () => {
    // Regression pin: the Admin tab's seed is one panel, and dockview's
    // fromJSON throws "root must be of type branch" on a leaf root — the
    // shipped engine crashed the whole Admin workspace until the converter
    // wrapped the lone panel in a branch.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const api = createDockview(container, {
      createComponent: () => {
        return {
          element: document.createElement("div"),
          init: () => {},
        };
      },
      theme: { name: "t", className: "t" },
    });

    api.layout(640, 480);
    expect(() => {
      api.fromJSON(
        toSerializedDockview(
          { kind: "panel", panelId: "admin-dashboard" },
          640,
          480,
          { gap: 7 },
        ),
      );
    }).not.toThrow();
    expect(
      api.panels.map((p) => {
        return p.id;
      }),
    ).toEqual(["admin-dashboard"]);
    expect(api.groups).toHaveLength(1);
    api.dispose();
  });

  it("renders a pinned rail's view at card + gap, exactly, in a gap-0 dockview", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const api = createDockview(container, {
      createComponent: () => {
        return {
          element: document.createElement("div"),
          init: () => {},
        };
      },
      theme: { name: "t", className: "t" },
    });

    const rail = {
      kind: "split",
      dir: "row",
      sizes: [0.73, 0.27],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "main" },
        { kind: "panel", panelId: "rail" },
      ],
    } as const;

    api.layout(1000, 800);
    api.fromJSON(toSerializedDockview(rail, 1000, 800, { gap: 7 }));

    // With no theme gap the model IS what dockview reports — no shave, no
    // flooring: the 360px design card is exactly the 367px view (its CSS
    // inset renders the card), the main card 626 the 633px one.
    expect(api.getGroup("group-2")?.api.width).toBe(367);
    expect(api.getGroup("group-1")?.api.width).toBe(633);

    api.dispose();
  });
});

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
}

interface LeafGroupId {
  id: string;
}

interface LeafGroupView {
  views: string[];
  activeView: string;
}

function collectLeaves(node: SerializedNode): SerializedNode[] {
  if (node.type === "leaf") {
    return [node];
  }

  return (node.data as SerializedNode[]).flatMap((child) => {
    return collectLeaves(child);
  });
}
