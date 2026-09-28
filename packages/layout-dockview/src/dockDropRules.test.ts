import { describe, expect, it } from "vitest";

import { type DockDropTarget, refusesDockDrop } from "#/dockDropRules";

describe("refusesDockDrop (Ruling R5)", () => {
  it.each([
    // dragged, target, refused
    [undefined, createGroup("center", undefined), false],
    [undefined, createGroup("top", undefined), false],
    [undefined, createGroup("left", undefined), false],
    [undefined, createGroup("center", 360), true],
    [undefined, createGroup("top", 360), true],
    [undefined, createGroup("left", 360), true],
    [360, createGroup("center", undefined), true],
    [360, createGroup("top", undefined), true],
    [360, createGroup("bottom", undefined), true],
    [360, createGroup("left", undefined), false],
    [360, createGroup("right", undefined), false],
    [360, createGroup("center", 360), false],
    [360, createGroup("top", 360), false],
    [360, createGroup("left", 360), true],
    [360, createGroup("center", 290), true],
    [360, createGroup("top", 290), true],
    [360, createEdge("left"), false],
    [360, createEdge("right"), false],
    [360, createEdge("top"), true],
    [360, createEdge("bottom"), true],
    [undefined, createEdge("top"), false],
  ] as const)("dragged %s onto %j → refused %s", (dragged, target, refused) => {
    expect(refusesDockDrop(dragged, target)).toBe(refused);
  });
});

function createGroup(
  position: DockDropTarget["position"],
  lock: number | undefined,
): DockDropTarget {
  return { kind: "group", position, lock };
}

function createEdge(position: DockDropTarget["position"]): DockDropTarget {
  return { kind: "layout-edge", position };
}
