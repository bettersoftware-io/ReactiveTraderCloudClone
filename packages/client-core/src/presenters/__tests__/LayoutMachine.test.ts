import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
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

    if (r.kind !== "split") {
      throw new Error("root split expected");
    }

    const inner = r.children[0];

    if (inner.kind !== "split") {
      throw new Error("inner split expected");
    }

    expect(inner.sizes).toEqual([0.5, 0.5]);
    // the outer split (whose second child is the blotter) is untouched
    expect(r.sizes).toEqual([0.8, 0.2]);
    m.dispose();
  });

  it("resize() on the root split ([]) replaces the root sizes", () => {
    const m = createLayoutMachine(port);
    m.intents.resize([], [0.6, 0.4]);
    const r = current(m).root;

    if (r.kind !== "split") {
      throw new Error("root split expected");
    }

    expect(r.sizes).toEqual([0.6, 0.4]);
    m.dispose();
  });

  it("resize() with an out-of-range path is a no-op", () => {
    const m = createLayoutMachine(port);
    m.intents.resize([9], [0.5, 0.5]);
    expect(current(m).root).toEqual(root);
    m.dispose();
  });

  it("resize() clears the target split's initialPx — after the first drag it is a plain ratio split", () => {
    const initialPxRoot: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.73, 0.27],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-analytics" },
      ],
    };

    const m = createLayoutMachine({
      initial: { root: initialPxRoot, maximized: null, collapsed: [] },
    });
    m.intents.resize([], [0.6, 0.4]);
    const r = current(m).root;

    if (r.kind !== "split") {
      throw new Error("root split expected");
    }

    expect(r.sizes).toEqual([0.6, 0.4]);
    expect(r.initialPx).toBeUndefined();
    m.dispose();
  });

  it("resize() on a nested split clears only that split's initialPx, leaving an ancestor's intact", () => {
    const nestedRoot: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.73, 0.27],
      initialPx: [undefined, 360],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        {
          kind: "split",
          dir: "column",
          sizes: [0.5, 0.5],
          initialPx: [undefined, 200],
          children: [
            { kind: "panel", panelId: "fx-analytics" },
            { kind: "panel", panelId: "fx-positions" },
          ],
        },
      ],
    };

    const m = createLayoutMachine({
      initial: { root: nestedRoot, maximized: null, collapsed: [] },
    });
    m.intents.resize([1], [0.3, 0.7]);
    const r = current(m).root;

    if (r.kind !== "split") {
      throw new Error("root split expected");
    }

    // the untouched root keeps its design-value default…
    expect(r.initialPx).toEqual([undefined, 360]);
    const rail = r.children[1];

    if (rail.kind !== "split") {
      throw new Error("rail split expected");
    }

    // …while the dragged rail becomes a plain ratio split.
    expect(rail.sizes).toEqual([0.3, 0.7]);
    expect(rail.initialPx).toBeUndefined();
    m.dispose();
  });

  it("dispose() completes the machine without error", () => {
    const m = createLayoutMachine(port);
    expect(() => {
      m.dispose();
    }).not.toThrow();
    m.dispose();
  });

  describe("insertPanel / removePanel / reset", () => {
    it("insertPanel() docks a new leaf, wrapping the root in a new row when it isn't already one", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      const r = current(m).root;

      if (r.kind !== "split") {
        throw new Error("split root expected");
      }

      expect(r.dir).toBe("row");
      expect(r.children).toEqual([
        root,
        { kind: "panel", panelId: "jarvis-1" },
      ]);
      expect(r.sizes).toEqual([0.75, 0.25]);
      expect(r.initialPx).toEqual([undefined, 360]);
      m.dispose();
    });

    it("insertPanel() twice grows the same dock column, keeping the rest of the tree untouched", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.insertPanel("jarvis-2");
      const r = current(m).root;

      if (r.kind !== "split") {
        throw new Error("split root expected");
      }

      expect(r.children[0]).toEqual(root);

      const dockColumn = r.children[1];

      if (dockColumn.kind !== "split") {
        throw new Error("dock column split expected");
      }

      expect(dockColumn.children).toEqual([
        { kind: "panel", panelId: "jarvis-1" },
        { kind: "panel", panelId: "jarvis-2" },
      ]);
      expect(dockColumn.sizes).toEqual([0.5, 0.5]);
      m.dispose();
    });

    it("insertPanel() with a duplicate id (an existing static panel) is a no-op", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("fx-rates");
      expect(current(m).root).toEqual(root);
      m.dispose();
    });

    it("removePanel() undocks a leaf, restoring the exact pre-insert tree once the dock column empties", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.removePanel("jarvis-1");
      expect(current(m).root).toEqual(root);
      m.dispose();
    });

    it("removePanel() with an unknown id is a no-op", () => {
      const m = createLayoutMachine(port);
      m.intents.removePanel("does-not-exist");
      expect(current(m).root).toEqual(root);
      m.dispose();
    });

    it("removePanel() on a docked leaf that a resize/maximize/collapse already touched doesn't disturb maximized/collapsed", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.maximize("fx-rates");
      m.intents.collapse("fx-analytics");
      m.intents.removePanel("jarvis-1");
      const state = current(m);
      expect(state.root).toEqual(root);
      expect(state.maximized).toBe("fx-rates");
      expect(state.collapsed).toEqual(["fx-analytics"]);
      m.dispose();
    });

    it("removePanel() clears maximized when it names the removed panel (a stale reference would strip every panel with none maximized)", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.maximize("jarvis-1");
      m.intents.removePanel("jarvis-1");
      expect(current(m).maximized).toBeNull();
      m.dispose();
    });

    it("removePanel() drops the removed panel from collapsed (a stale ghost id would silently pre-collapse a later re-insert of the same id)", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.collapse("jarvis-1");
      m.intents.removePanel("jarvis-1");
      expect(current(m).collapsed).toEqual([]);
      m.dispose();
    });

    it("insertPanel() on the real FX default port appends a new dock column after the static rail, never grows it — witnesses that staticIds is truly derived from port.initial.root, not an empty/no-op set", () => {
      const { initial: fxInitial } = createDefaultLayoutPort("fx");
      const m = createLayoutMachine({ initial: fxInitial });
      m.intents.insertPanel("jarvis-1");
      const r = current(m).root;

      if (r.kind !== "split") {
        throw new Error("split root expected");
      }

      if (fxInitial.root.kind !== "split") {
        throw new Error("fx default root is a split");
      }

      expect(r.children).toHaveLength(3);
      // the real analytics/positions rail (children[1]) is untouched — it was
      // never mistaken for a dock column and grown/replaced in place.
      expect(r.children[1]).toEqual(fxInitial.root.children[1]);
      expect(r.children[2]).toEqual({ kind: "panel", panelId: "jarvis-1" });
      m.dispose();
    });

    it("reset() returns exactly port.initial, discarding docked leaves, maximize, collapse, and resizes", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.maximize("fx-rates");
      m.intents.collapse("fx-analytics");
      m.intents.resize([], [0.4, 0.6]);
      m.intents.reset();
      expect(current(m)).toEqual(initial);
      expect(current(m).root).toBe(initial.root);
      m.dispose();
    });

    it("reset() is idempotent and can be followed by further intents", () => {
      const m = createLayoutMachine(port);
      m.intents.insertPanel("jarvis-1");
      m.intents.reset();
      m.intents.insertPanel("jarvis-2");
      const r = current(m).root;

      if (r.kind !== "split") {
        throw new Error("split root expected");
      }

      expect(r.children).toEqual([
        root,
        { kind: "panel", panelId: "jarvis-2" },
      ]);
      m.dispose();
    });
  });
});

function current(m: ReturnType<typeof createLayoutMachine>): LayoutState {
  let view: LayoutState | undefined;
  const sub = m.state$.subscribe((s) => {
    view = s;
  });
  sub.unsubscribe();

  if (!view) {
    throw new Error("LayoutMachine state$ did not emit synchronously");
  }

  return view;
}
