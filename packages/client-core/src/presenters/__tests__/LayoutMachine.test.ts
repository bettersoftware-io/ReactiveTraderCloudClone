import { describe, expect, it } from "vitest";

import type { LayoutNode, LayoutPort, LayoutState } from "#/layout/layoutPort";

import { createLayoutMachine } from "../LayoutMachine";

const root: LayoutNode = {
  kind: "split",
  dir: "column",
  sizes: [0.8, 0.2],
  children: [
    {
      kind: "split",
      dir: "row",
      sizes: [0.7, 0.3],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-analytics" },
      ],
    },
    { kind: "panel", panelId: "fx-blotter" },
  ],
};
const initial: LayoutState = { root, maximized: null, collapsed: [] };
const port: LayoutPort = { initial };

describe("createLayoutMachine", () => {
  it("seeds the initial tree from the port", () => {
    const m = createLayoutMachine(port);
    expect(current(m).root).toEqual(root);
    expect(current(m).maximized).toBeNull();
    expect(current(m).collapsed).toEqual([]);
    m.dispose();
  });

  it("maximize() records the panel (engine collapses siblings to strips)", () => {
    const m = createLayoutMachine(port);
    m.intents.maximize("fx-rates");
    expect(current(m).maximized).toBe("fx-rates");
    m.dispose();
  });

  it("restore() clears the maximized panel", () => {
    const m = createLayoutMachine(port);
    m.intents.maximize("fx-rates");
    m.intents.restore();
    expect(current(m).maximized).toBeNull();
    m.dispose();
  });

  it("collapse() adds the panel to the strip set, deduped", () => {
    const m = createLayoutMachine(port);
    m.intents.collapse("fx-analytics");
    m.intents.collapse("fx-analytics");
    expect(current(m).collapsed).toEqual(["fx-analytics"]);
    m.dispose();
  });

  it("expand() removes the panel from the strip set", () => {
    const m = createLayoutMachine(port);
    m.intents.collapse("fx-analytics");
    m.intents.expand("fx-analytics");
    expect(current(m).collapsed).toEqual([]);
    m.dispose();
  });

  it("resize([0], sizes) replaces the inner row split's sizes immutably", () => {
    const m = createLayoutMachine(port);
    m.intents.resize([0], [0.5, 0.5]);
    const r = current(m).root;
    if (r.kind !== "split") throw new Error("root split expected");
    const inner = r.children[0];
    if (inner.kind !== "split") throw new Error("inner split expected");
    expect(inner.sizes).toEqual([0.5, 0.5]);
    // the outer split (whose second child is the blotter) is untouched
    expect(r.sizes).toEqual([0.8, 0.2]);
    m.dispose();
  });

  it("resize() on the root split ([]) replaces the root sizes", () => {
    const m = createLayoutMachine(port);
    m.intents.resize([], [0.6, 0.4]);
    const r = current(m).root;
    if (r.kind !== "split") throw new Error("root split expected");
    expect(r.sizes).toEqual([0.6, 0.4]);
    m.dispose();
  });

  it("resize() with an out-of-range path is a no-op", () => {
    const m = createLayoutMachine(port);
    m.intents.resize([9], [0.5, 0.5]);
    expect(current(m).root).toEqual(root);
    m.dispose();
  });

  it("dispose() completes the machine without error", () => {
    const m = createLayoutMachine(port);
    expect(() => {
      m.dispose();
    }).not.toThrow();
    m.dispose();
  });
});

function current(m: ReturnType<typeof createLayoutMachine>): LayoutState {
  let view: LayoutState | undefined;
  const sub = m.state$.subscribe((s) => {
    view = s;
  });
  sub.unsubscribe();
  if (!view) throw new Error("LayoutMachine state$ did not emit synchronously");
  return view;
}
