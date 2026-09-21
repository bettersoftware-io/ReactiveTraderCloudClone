import { describe, expect, it } from "vitest";

import type { EqDrawing, EqDrawingsState } from "@rtc/core-api";

import {
  INITIAL_EQ_DRAWINGS_STATE,
  reduceEqDrawings,
} from "#/presenters/eqDrawingsFold";

describe("INITIAL_EQ_DRAWINGS_STATE", () => {
  it("starts with the cursor tool, no drawings, and no selection", () => {
    expect(INITIAL_EQ_DRAWINGS_STATE).toEqual({
      tool: "cursor",
      drawings: {},
      selectedId: null,
    });
  });
});

describe("reduceEqDrawings — setTool", () => {
  it("drops the selection", () => {
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      selectedId: "t1",
    };
    const next = reduceEqDrawings(state, { kind: "setTool", tool: "hline" });
    expect(next.tool).toBe("hline");
    expect(next.selectedId).toBeNull();
  });
});

describe("reduceEqDrawings — addDrawing", () => {
  it("appends, selects the new id, and reverts to cursor", () => {
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      tool: "trendline",
    };
    const t1 = createTrendline("t1");
    const next = reduceEqDrawings(state, {
      kind: "addDrawing",
      sym: "AAPL",
      drawing: t1,
    });
    expect(next.drawings.AAPL).toEqual([t1]);
    expect(next.selectedId).toBe("t1");
    expect(next.tool).toBe("cursor");
  });
});

describe("reduceEqDrawings — updateDrawing", () => {
  it("replaces the matching id in place, z-order stable", () => {
    const a = createHline("d1", 100);
    const b = createHline("d2", 110);
    const c = createHline("d3", 120);
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [a, b, c] },
    };

    const next = reduceEqDrawings(state, {
      kind: "updateDrawing",
      sym: "AAPL",
      drawing: createHline("d2", 999),
    });
    expect(next.drawings.AAPL).toEqual([a, createHline("d2", 999), c]);
  });

  it("returns the same reference for an unknown id", () => {
    const a = createHline("d1", 100);
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [a] },
    };

    const next = reduceEqDrawings(state, {
      kind: "updateDrawing",
      sym: "AAPL",
      drawing: createHline("ghost", 1),
    });
    expect(next).toBe(state);
  });
});

describe("reduceEqDrawings — selectDrawing", () => {
  it("sets the selection", () => {
    const next = reduceEqDrawings(INITIAL_EQ_DRAWINGS_STATE, {
      kind: "selectDrawing",
      id: "t1",
    });
    expect(next.selectedId).toBe("t1");
  });
});

describe("reduceEqDrawings — deleteSelected", () => {
  it("is the same reference when nothing is selected", () => {
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [createHline("d1", 100)] },
    };

    const next = reduceEqDrawings(state, {
      kind: "deleteSelected",
      sym: "AAPL",
    });
    expect(next).toBe(state);
  });

  it("is the same reference when the selected id is not in that symbol's list", () => {
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [createHline("d1", 100)] },
      selectedId: "not-here",
    };

    const next = reduceEqDrawings(state, {
      kind: "deleteSelected",
      sym: "AAPL",
    });
    expect(next).toBe(state);
  });

  it("removes the selected drawing and clears the selection", () => {
    const d1 = createHline("d1", 100);
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [d1] },
      selectedId: "d1",
    };

    const next = reduceEqDrawings(state, {
      kind: "deleteSelected",
      sym: "AAPL",
    });
    expect(next.drawings.AAPL).toEqual([]);
    expect(next.selectedId).toBeNull();
  });
});

describe("reduceEqDrawings — shiftAnchors", () => {
  it("moves BOTH anchors of every trendline for that symbol, leaving hlines and other symbols alone", () => {
    const t1 = createTrendline("t1");
    const h1 = createHline("h1", 150);
    const otherSymTrendline = createTrendline("t2");
    const state: EqDrawingsState = {
      ...INITIAL_EQ_DRAWINGS_STATE,
      drawings: { AAPL: [t1, h1], TSLA: [otherSymTrendline] },
    };

    const next = reduceEqDrawings(state, {
      kind: "shiftAnchors",
      sym: "AAPL",
      by: 30,
    });
    expect(next.drawings.AAPL).toEqual([
      {
        ...t1,
        a: { ...t1.a, index: t1.a.index + 30 },
        b: { ...t1.b, index: t1.b.index + 30 },
      },
      h1,
    ]);
    expect(next.drawings.TSLA).toEqual([otherSymTrendline]);
  });

  it("returns the same reference for a symbol with no list", () => {
    const next = reduceEqDrawings(INITIAL_EQ_DRAWINGS_STATE, {
      kind: "shiftAnchors",
      sym: "AAPL",
      by: 10,
    });
    expect(next).toBe(INITIAL_EQ_DRAWINGS_STATE);
  });
});

interface TrendlineTag {
  readonly kind: "trendline";
}
type Trendline = Extract<EqDrawing, TrendlineTag>;

function createTrendline(id: string): Trendline {
  return {
    id,
    kind: "trendline",
    a: { index: 10, price: 100 },
    b: { index: 20, price: 110 },
  };
}

function createHline(id: string, price: number): EqDrawing {
  return { id, kind: "hline", price };
}
