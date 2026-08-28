import { createDockview, type SerializedDockview } from "dockview";
import { beforeAll, describe, expect, it } from "vitest";

import { compensateGap } from "#/dockBlob";
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

describe("compensateGap", () => {
  it("is the identity without a gap", () => {
    const layout = toSerializedDockview(RAIL, 1000, 800);
    expect(compensateGap(layout, 0)).toBe(layout);
  });

  it("adds each child's gap share back so a save/load cycle is exact", () => {
    const api = mountDockview(7);
    api.layout(1000, 800);
    api.fromJSON(toSerializedDockview(RAIL, 1000, 800, { gap: 7 }));
    const rendered = sizesOf(api.toJSON().grid.root as SerializedNode);

    // Three cycles through the compensated blob: what dockview renders never
    // moves. (Uncompensated, the rail alone drifted 360 → 358 → 349 in the
    // browser — the shortfall each cycle is redistributed proportionally,
    // which is not the inverse of the even shave.)
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const blob = JSON.stringify(compensateGap(api.toJSON(), 7));
      api.fromJSON(JSON.parse(blob));
      expect(sizesOf(api.toJSON().grid.root as SerializedNode)).toEqual(
        rendered,
      );
    }

    api.dispose();
  });

  it("drifts WITHOUT the compensation — the regression this pins", () => {
    const api = mountDockview(7);
    api.layout(1000, 800);
    api.fromJSON(toSerializedDockview(RAIL, 1000, 800, { gap: 7 }));
    const before = sizesOf(api.toJSON().grid.root as SerializedNode);

    api.fromJSON(JSON.parse(JSON.stringify(api.toJSON())));
    const after = sizesOf(api.toJSON().grid.root as SerializedNode);

    expect(after).not.toEqual(before);
    api.dispose();
  });

  it("compensates every branch level, by that branch's own child count", () => {
    const layout = toSerializedDockview(RAIL, 1000, 800, { gap: 7 });
    // Strip the seed's own compensation to fake dockview's rendered output…
    const root = layout.grid.root as SerializedNode;
    const [column, rail] = root.data as SerializedNode[];
    const [rates, blotter] = column.data as SerializedNode[];
    const shaved = {
      ...layout,
      grid: {
        ...layout.grid,
        root: {
          ...root,
          data: [
            {
              ...column,
              size: (column.size ?? 0) - 3.5,
              data: [
                { ...rates, size: (rates.size ?? 0) - 3.5 },
                { ...blotter, size: (blotter.size ?? 0) - 3.5 },
              ],
            },
            { ...rail, size: (rail.size ?? 0) - 3.5 },
          ],
        },
      },
    };

    // …and the compensation restores the seed's model sizes exactly.
    expect(
      sizesOf(
        compensateGap(shaved as unknown as SerializedDockview, 7).grid
          .root as SerializedNode,
      ),
    ).toEqual(sizesOf(root));
  });
});

interface SerializedNode {
  type: "leaf" | "branch";
  data: unknown;
  size?: number;
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

function mountDockview(gap: number): ReturnType<typeof createDockview> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  return createDockview(container, {
    createComponent: () => {
      return { element: document.createElement("div"), init: () => {} };
    },
    theme: { name: "t", className: "t", gap },
  });
}
