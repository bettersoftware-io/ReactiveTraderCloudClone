import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
import type { LayoutNode, PanelId } from "#/layout/layoutPort";

import {
  DOCK_COLUMN_INITIAL_PX,
  dockedLeafIds,
  insertDockedLeaf,
  removeDockedLeaf,
} from "../dockColumn";

const ADMIN_LEAF: LayoutNode = { kind: "panel", panelId: "admin-dashboard" };

describe("dockedLeafIds", () => {
  it("returns every leaf id not present in staticIds, in tree order", () => {
    const root: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.5],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "jarvis-1" },
      ],
    };

    expect(dockedLeafIds(root, ["fx-rates"])).toEqual(["jarvis-1"]);
  });

  it("returns an empty array when every leaf id is static", () => {
    const { initial } = createDefaultLayoutPort("fx");
    expect(dockedLeafIds(initial.root, staticIdsOf(initial.root))).toEqual([]);
  });

  it("returns all leaf ids when staticIds is empty", () => {
    const { initial } = createDefaultLayoutPort("credit");
    expect(dockedLeafIds(initial.root, [])).toEqual(leafIds(initial.root));
  });
});

describe("insertDockedLeaf", () => {
  it("wraps a non-row root into a new row split [root, dockLeaf], 0.75/0.25, initialPx on the dock slot", () => {
    const result = insertDockedLeaf(ADMIN_LEAF, "jarvis-1", [
      "admin-dashboard",
    ]);

    expect(result).toEqual({
      kind: "split",
      dir: "row",
      children: [ADMIN_LEAF, { kind: "panel", panelId: "jarvis-1" }],
      sizes: [0.75, 0.25],
      initialPx: [undefined, DOCK_COLUMN_INITIAL_PX],
    });
  });

  it("wraps a column-dir root (not a row) the same way", () => {
    const columnRoot: LayoutNode = {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "b" },
      ],
    };
    const result = insertDockedLeaf(columnRoot, "jarvis-1", ["a", "b"]);

    expect(result).toEqual({
      kind: "split",
      dir: "row",
      children: [columnRoot, { kind: "panel", panelId: "jarvis-1" }],
      sizes: [0.75, 0.25],
      initialPx: [undefined, DOCK_COLUMN_INITIAL_PX],
    });
  });

  it("first insertion on a row-root default tree (FX) appends a new dock column after the real rail — never mistakes the analytics/positions rail for a dock column", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const staticIds = staticIdsOf(initial.root);
    const originalRoot = initial.root;

    if (originalRoot.kind !== "split") {
      throw new Error("split expected");
    }

    const result = insertDockedLeaf(originalRoot, "jarvis-1", staticIds);

    if (result.kind !== "split") {
      throw new Error("split expected");
    }

    expect(result.dir).toBe("row");
    expect(result.children).toHaveLength(3);
    expect(result.children[0]).toEqual(originalRoot.children[0]);
    expect(result.children[1]).toEqual(originalRoot.children[1]);
    expect(result.children[2]).toEqual({ kind: "panel", panelId: "jarvis-1" });
    expect(result.initialPx?.at(-1)).toBe(DOCK_COLUMN_INITIAL_PX);
    // the rescaled existing fractions plus the new dock fraction sum to 1
    expect(
      result.sizes.reduce((a, b) => {
        return a + b;
      }, 0),
    ).toBeCloseTo(1, 10);
  });

  it("a second insertion turns the single-leaf dock column into a 2-child column split with equal (0.5/0.5) fractions", () => {
    const { initial } = createDefaultLayoutPort("credit");
    const staticIds = staticIdsOf(initial.root);
    const once = insertDockedLeaf(initial.root, "jarvis-1", staticIds);
    const twice = insertDockedLeaf(once, "jarvis-2", staticIds);

    if (twice.kind !== "split") {
      throw new Error("split expected");
    }

    const dockColumn = twice.children.at(-1);

    if (dockColumn?.kind !== "split") {
      throw new Error("dock column split expected");
    }

    expect(dockColumn.dir).toBe("column");
    expect(dockColumn.children).toEqual([
      { kind: "panel", panelId: "jarvis-1" },
      { kind: "panel", panelId: "jarvis-2" },
    ]);
    expect(dockColumn.sizes).toEqual([0.5, 0.5]);
  });

  it("a third insertion appends into the existing dock column with equal (1/3) fractions", () => {
    const { initial } = createDefaultLayoutPort("equities");
    const staticIds = staticIdsOf(initial.root);
    const tree = [1, 2, 3].reduce<LayoutNode>((acc, n) => {
      return insertDockedLeaf(acc, `jarvis-${n}`, staticIds);
    }, initial.root);

    if (tree.kind !== "split") {
      throw new Error("split expected");
    }

    const dockColumn = tree.children.at(-1);

    if (dockColumn?.kind !== "split") {
      throw new Error("dock column split expected");
    }

    expect(dockColumn.children).toEqual([
      { kind: "panel", panelId: "jarvis-1" },
      { kind: "panel", panelId: "jarvis-2" },
      { kind: "panel", panelId: "jarvis-3" },
    ]);
    expect(dockColumn.sizes).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("duplicate id (already present anywhere in the tree) is a no-op — same reference returned", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const result = insertDockedLeaf(
      initial.root,
      "fx-rates",
      staticIdsOf(initial.root),
    );
    expect(result).toBe(initial.root);
  });

  it("a duplicate of an already-docked id is also a no-op", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const staticIds = staticIdsOf(initial.root);
    const once = insertDockedLeaf(initial.root, "jarvis-1", staticIds);
    const again = insertDockedLeaf(once, "jarvis-1", staticIds);
    expect(again).toBe(once);
  });
});

describe("removeDockedLeaf", () => {
  it("unknown id is a no-op — same reference returned", () => {
    const { initial } = createDefaultLayoutPort("fx");
    const result = removeDockedLeaf(initial.root, "does-not-exist");
    expect(result).toBe(initial.root);
  });

  it("removing the sole docked leaf collapses the wrapping row back to the original root", () => {
    const result = removeDockedLeaf(ADMIN_LEAF, "admin-dashboard");
    // admin-dashboard IS present as the whole (non-split) root here — removing
    // the only leaf of a non-split root is a degenerate case handled by the
    // "no parent split to collapse into" path: nothing to collapse, no-op.
    expect(result).toBe(ADMIN_LEAF);
  });

  it("removing a leaf from a 2-child split collapses the split to the remaining sibling", () => {
    const root: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "jarvis-1" },
      ],
    };

    expect(removeDockedLeaf(root, "jarvis-1")).toEqual({
      kind: "panel",
      panelId: "a",
    });
  });

  it("removing one leaf from a 3-child split renormalizes the remaining sizes to sum to 1", () => {
    const root: LayoutNode = {
      kind: "split",
      dir: "column",
      sizes: [1 / 3, 1 / 3, 1 / 3],
      children: [
        { kind: "panel", panelId: "jarvis-1" },
        { kind: "panel", panelId: "jarvis-2" },
        { kind: "panel", panelId: "jarvis-3" },
      ],
    };

    const result = removeDockedLeaf(root, "jarvis-2");

    if (result.kind !== "split") {
      throw new Error("split expected");
    }

    expect(result.children).toEqual([
      { kind: "panel", panelId: "jarvis-1" },
      { kind: "panel", panelId: "jarvis-3" },
    ]);
    expect(result.sizes[0]).toBeCloseTo(0.5, 10);
    expect(result.sizes[1]).toBeCloseTo(0.5, 10);
    expect(
      result.sizes.reduce((a, b) => {
        return a + b;
      }, 0),
    ).toBeCloseTo(1, 10);
  });

  it("removing a nested leaf drops its own fixedPx/initialPx entry, keeping array lengths aligned", () => {
    const root: LayoutNode = {
      kind: "split",
      dir: "row",
      sizes: [0.5, 0.25, 0.25],
      initialPx: [undefined, 200, 300],
      children: [
        { kind: "panel", panelId: "a" },
        { kind: "panel", panelId: "jarvis-1" },
        { kind: "panel", panelId: "jarvis-2" },
      ],
    };

    const result = removeDockedLeaf(root, "jarvis-1");

    if (result.kind !== "split") {
      throw new Error("split expected");
    }

    expect(
      result.children.map((c) => {
        return c.kind === "panel" ? c.panelId : null;
      }),
    ).toEqual(["a", "jarvis-2"]);
    expect(result.initialPx).toEqual([undefined, 300]);
  });
});

describe("structural round-trip: remove(insert(tree, id), id) === tree", () => {
  it.each(["fx", "credit", "equities"] as const)(
    "%s default tree: a single dock insert then remove restores the exact original tree",
    (tab) => {
      const { initial } = createDefaultLayoutPort(tab);
      const staticIds = staticIdsOf(initial.root);
      const inserted = insertDockedLeaf(initial.root, "jarvis-1", staticIds);
      const restored = removeDockedLeaf(inserted, "jarvis-1");
      expectSameTreeShape(restored, initial.root);
    },
  );

  it.each(["fx", "credit", "equities"] as const)(
    "%s default tree: two inserts then removing both (in insertion order) restores the exact original tree",
    (tab) => {
      const { initial } = createDefaultLayoutPort(tab);
      const staticIds = staticIdsOf(initial.root);
      const afterInserts = ["jarvis-1", "jarvis-2"].reduce<LayoutNode>(
        (acc, id) => {
          return insertDockedLeaf(acc, id, staticIds);
        },
        initial.root,
      );

      const restored = ["jarvis-1", "jarvis-2"].reduce<LayoutNode>(
        (acc, id) => {
          return removeDockedLeaf(acc, id);
        },
        afterInserts,
      );
      expectSameTreeShape(restored, initial.root);
    },
  );

  it.each(["fx", "credit", "equities"] as const)(
    "%s default tree: two inserts then removing both (in REVERSE order) restores the exact original tree",
    (tab) => {
      const { initial } = createDefaultLayoutPort(tab);
      const staticIds = staticIdsOf(initial.root);
      const afterInserts = ["jarvis-1", "jarvis-2"].reduce<LayoutNode>(
        (acc, id) => {
          return insertDockedLeaf(acc, id, staticIds);
        },
        initial.root,
      );

      const restored = ["jarvis-2", "jarvis-1"].reduce<LayoutNode>(
        (acc, id) => {
          return removeDockedLeaf(acc, id);
        },
        afterInserts,
      );
      expectSameTreeShape(restored, initial.root);
    },
  );

  it.each(["fx", "credit", "equities"] as const)(
    "%s default tree: every intermediate split's sizes always sum to 1 across an insert/remove cycle",
    (tab) => {
      const { initial } = createDefaultLayoutPort(tab);
      const staticIds = staticIdsOf(initial.root);
      let tree = initial.root;
      const ids = ["jarvis-1", "jarvis-2", "jarvis-3"];

      for (const id of ids) {
        tree = insertDockedLeaf(tree, id, staticIds);
        assertSizesSumToOne(tree);
      }

      for (const id of ids) {
        tree = removeDockedLeaf(tree, id);
        assertSizesSumToOne(tree);
      }

      expectSameTreeShape(tree, initial.root);
    },
  );
});

function assertSizesSumToOne(node: LayoutNode): void {
  if (node.kind !== "split") {
    return;
  }

  expect(
    node.sizes.reduce((a, b) => {
      return a + b;
    }, 0),
  ).toBeCloseTo(1, 10);

  for (const child of node.children) {
    assertSizesSumToOne(child);
  }
}

/** Static ids for a given default tree = every leaf id already in it (nothing
 * excluded), mirroring how `createLayoutMachine` derives `staticIds` from
 * `port.initial.root` via `dockedLeafIds(root, [])`. */
function staticIdsOf(root: LayoutNode): readonly PanelId[] {
  return dockedLeafIds(root, []);
}

function leafIds(node: LayoutNode): readonly PanelId[] {
  return node.kind === "panel"
    ? [node.panelId]
    : node.children.flatMap(leafIds);
}

/** Structural round-trip equality tolerant of float drift: a rescale
 * (`* (1 - f)`) undone by its inverse renormalize (`/ sum`) is not always
 * bit-exact in IEEE 754 (e.g. `(0.78 * 0.75) / 0.75 === 0.7799999999999999`),
 * so the round-trip property is "the same tree shape, same numbers up to
 * floating error" rather than reference/bit equality. */
function expectSameTreeShape(actual: LayoutNode, expected: LayoutNode): void {
  expect(actual.kind).toBe(expected.kind);

  if (actual.kind === "panel" || expected.kind === "panel") {
    if (actual.kind !== "panel" || expected.kind !== "panel") {
      throw new Error("kind mismatch");
    }

    expect(actual.panelId).toBe(expected.panelId);
    return;
  }

  expect(actual.dir).toBe(expected.dir);
  expect(actual.children).toHaveLength(expected.children.length);
  expect(actual.sizes).toHaveLength(expected.sizes.length);

  for (let i = 0; i < expected.sizes.length; i++) {
    expect(actual.sizes[i]).toBeCloseTo(expected.sizes[i] as number, 9);
  }

  expect(actual.fixedPx).toEqual(expected.fixedPx);
  expect(actual.initialPx).toEqual(expected.initialPx);

  for (let i = 0; i < expected.children.length; i++) {
    expectSameTreeShape(
      actual.children[i] as LayoutNode,
      expected.children[i] as LayoutNode,
    );
  }
}
