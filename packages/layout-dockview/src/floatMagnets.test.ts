import { describe, expect, it } from "vitest";

import {
  attachedWindowFor,
  type Box,
  FLOAT_FLUSH_TOLERANCE_PX,
  FLOAT_SNAP_DISTANCE_PX,
  flushSideOf,
  shouldAttachOnRelease,
  snapToSiblings,
  stackedWidthFor,
} from "#/floatMagnets";

describe("snapToSiblings", () => {
  it("pulls the dragged box flush to a sibling's right edge at exactly the snap distance, not one px beyond", () => {
    const other = createBox(100, 100, 300, 200);
    const atLimit = snapToSiblings(
      createBox(400 + FLOAT_SNAP_DISTANCE_PX, 100, 300, 200),
      [other],
      false,
    );

    const beyond = snapToSiblings(
      createBox(400 + FLOAT_SNAP_DISTANCE_PX + 1, 100, 300, 200),
      [other],
      false,
    );

    expect(atLimit.left).toBe(400);
    expect(atLimit.engaged).toEqual({ other, side: "right" });
    expect(beyond.left).toBe(400 + FLOAT_SNAP_DISTANCE_PX + 1);
    expect(beyond.engaged).toBeNull();
  });

  it("snaps to the sibling's left edge when approaching from the left", () => {
    const other = createBox(500, 100, 300, 200);
    const result = snapToSiblings(
      createBox(500 - 300 - 10, 100, 300, 200),
      [other],
      false,
    );

    expect(result.left).toBe(200);
    expect(result.engaged?.side).toBe("left");
  });

  it("snaps below and above along the vertical axis", () => {
    const other = createBox(100, 100, 300, 200);

    expect(
      snapToSiblings(createBox(100, 310, 300, 150), [other], false),
    ).toMatchObject({ top: 300, engaged: { side: "bottom" } });
    expect(
      snapToSiblings(createBox(100, 100 - 150 - 9, 300, 150), [other], false),
    ).toMatchObject({ top: -50, engaged: { side: "top" } });
  });

  it("aligns the tops only when they are within range too", () => {
    const other = createBox(100, 100, 300, 200);

    expect(
      snapToSiblings(createBox(405, 108, 300, 200), [other], false).top,
    ).toBe(100);
    expect(
      snapToSiblings(createBox(405, 140, 300, 200), [other], false).top,
    ).toBe(140);
  });

  it("ignores a sibling that does not overlap on the perpendicular axis", () => {
    const other = createBox(100, 100, 300, 200);
    const result = snapToSiblings(
      createBox(405, 400, 300, 200),
      [other],
      false,
    );

    expect(result).toEqual({ left: 405, top: 400, engaged: null });
  });

  it("takes the nearest qualifying edge when two siblings qualify", () => {
    const near = createBox(100, 100, 300, 200); // right edge 400
    const far = createBox(715, 100, 300, 200); // left edge 715, dragged right edge 705: 10px away, still in range
    const result = snapToSiblings(
      createBox(405, 100, 300, 200),
      [far, near],
      false,
    );

    expect(result.left).toBe(400);
    expect(result.engaged?.other).toBe(near);
  });

  it("returns the proposal untouched while suspended (Option held)", () => {
    const proposed = createBox(405, 108, 300, 200);

    expect(
      snapToSiblings(proposed, [createBox(100, 100, 300, 200)], true),
    ).toEqual({ left: 405, top: 108, engaged: null });
  });
});

describe("flushSideOf", () => {
  it.each([
    ["right", createBox(400 + FLOAT_FLUSH_TOLERANCE_PX, 120, 200, 100)],
    ["left", createBox(100 - 200 - FLOAT_FLUSH_TOLERANCE_PX, 120, 200, 100)],
    ["bottom", createBox(150, 300 + FLOAT_FLUSH_TOLERANCE_PX, 200, 100)],
    ["top", createBox(150, 100 - 100 - FLOAT_FLUSH_TOLERANCE_PX, 200, 100)],
  ] as const)(
    "reports %s for a box touching that side within tolerance",
    (side, mine) => {
      expect(flushSideOf(mine, theirs)).toBe(side);
    },
  );

  it("is null one px past the tolerance and for a corner-only touch", () => {
    expect(
      flushSideOf(
        createBox(400 + FLOAT_FLUSH_TOLERANCE_PX + 1, 120, 200, 100),
        theirs,
      ),
    ).toBeNull();
    expect(flushSideOf(createBox(400, 300, 200, 100), theirs)).toBeNull();
  });

  const theirs = createBox(100, 100, 300, 200);
});

describe("stackedWidthFor", () => {
  it("keeps the target's width when neither is locked", () => {
    expect(
      stackedWidthFor(
        { width: 500, lock: undefined },
        { width: 420, lock: undefined },
      ),
    ).toBe(500);
  });

  it("adopts the lock from whichever side has one", () => {
    expect(
      stackedWidthFor(
        { width: 500, lock: undefined },
        { width: 367, lock: 367 },
      ),
    ).toBe(367);
    expect(
      stackedWidthFor(
        { width: 367, lock: 367 },
        { width: 500, lock: undefined },
      ),
    ).toBe(367);
  });

  it("keeps the target's lock when both are locked", () => {
    expect(
      stackedWidthFor({ width: 367, lock: 367 }, { width: 300, lock: 300 }),
    ).toBe(367);
  });
});

describe("attachedWindowFor", () => {
  it("side by side: the union, as tall as the taller, the newcomer keeping its width", () => {
    const plan = attachedWindowFor(
      createBox(400, 100, 250, 260),
      theirs,
      "right",
      { mine: undefined, theirs: undefined },
    );

    expect(plan).toEqual({
      window: createBox(100, 100, 550, 260),
      newcomerExtent: 250,
      memberWidth: null,
    });
  });

  it("stacked: anchored at the target's left, the heights summed, the lock adopted as the member width", () => {
    const plan = attachedWindowFor(
      createBox(90, 300, 500, 150),
      theirs,
      "bottom",
      { mine: undefined, theirs: 300 },
    );

    expect(plan).toEqual({
      window: createBox(100, 100, 300, 350),
      newcomerExtent: 150,
      memberWidth: 300,
    });
  });

  it("stacked above: the window's top moves up by the newcomer's height", () => {
    const plan = attachedWindowFor(
      createBox(100, -50, 300, 150),
      theirs,
      "top",
      { mine: undefined, theirs: undefined },
    );

    expect(plan.window).toEqual(createBox(100, -50, 300, 350));
  });

  const theirs = createBox(100, 100, 300, 200);
});

describe("shouldAttachOnRelease", () => {
  it("attaches a lone float released flush with no modifier", () => {
    expect(shouldAttachOnRelease(base)).toBe(true);
  });

  it.each([
    ["a cluster", { lone: false }],
    ["Option held", { altKey: true }],
    ["Shift held", { shiftKey: true }],
    ["a detach in the same drag", { detachedThisDrag: true }],
    ["no flush side", { side: null }],
  ])("refuses for %s", (_label, override) => {
    expect(shouldAttachOnRelease({ ...base, ...override })).toBe(false);
  });

  const base = {
    lone: true,
    altKey: false,
    shiftKey: false,
    detachedThisDrag: false,
    side: "right" as const,
  };
});

function createBox(
  left: number,
  top: number,
  width: number,
  height: number,
): Box {
  return { left, top, width, height };
}
