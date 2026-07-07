import { describe, expect, it } from "vitest";

import {
  coalesceOrder,
  computeRankDirections,
  rowHeight,
} from "./useRankGlide";

describe("computeRankDirections", () => {
  it("marks every row 'unchanged' when there is no previous rank", () => {
    expect(computeRankDirections(undefined, ["AAPL", "MSFT", "TSLA"])).toEqual({
      AAPL: "unchanged",
      MSFT: "unchanged",
      TSLA: "unchanged",
    });
  });

  it("marks a row 'unchanged' when its index didn't move", () => {
    const prev = { AAPL: 0, MSFT: 1, TSLA: 2 };
    expect(computeRankDirections(prev, ["AAPL", "MSFT", "TSLA"])).toEqual({
      AAPL: "unchanged",
      MSFT: "unchanged",
      TSLA: "unchanged",
    });
  });

  it("marks a row 'rose' when it moved to a lower index (up the list)", () => {
    const prev = { AAPL: 0, MSFT: 1, TSLA: 2 };
    // TSLA jumps from index 2 to index 0.
    expect(computeRankDirections(prev, ["TSLA", "AAPL", "MSFT"])).toEqual({
      TSLA: "rose",
      AAPL: "fell",
      MSFT: "fell",
    });
  });

  it("marks a row 'fell' when it moved to a higher index (down the list)", () => {
    const prev = { AAPL: 0, MSFT: 1, TSLA: 2 };
    // AAPL drops from index 0 to index 2; MSFT and TSLA each shift up one.
    expect(computeRankDirections(prev, ["MSFT", "TSLA", "AAPL"])).toEqual({
      MSFT: "rose",
      TSLA: "rose",
      AAPL: "fell",
    });
  });

  it("marks a newly-appeared symbol (absent from prevRank) 'unchanged'", () => {
    const prev = { AAPL: 0, MSFT: 1 };
    expect(computeRankDirections(prev, ["AAPL", "MSFT", "TSLA"])).toEqual({
      AAPL: "unchanged",
      MSFT: "unchanged",
      TSLA: "unchanged",
    });
  });
});

describe("coalesceOrder — I4 reorder coalescing", () => {
  it("commits a candidate immediately while idle (not gliding)", () => {
    const decision = coalesceOrder(["AAPL"], null, ["MSFT"], false);
    expect(decision).toEqual({ committed: ["MSFT"], bufferedPending: null });
  });

  it("buffers the candidate instead of committing while a glide is in flight", () => {
    const decision = coalesceOrder(
      ["AAPL", "MSFT"],
      null,
      ["MSFT", "AAPL"],
      true,
    );
    expect(decision).toEqual({
      committed: ["AAPL", "MSFT"],
      bufferedPending: ["MSFT", "AAPL"],
    });
  });

  it("a candidate matching what's already committed is a no-op and clears any stale pending", () => {
    const decision = coalesceOrder(
      ["AAPL", "MSFT"],
      ["MSFT", "AAPL"],
      ["AAPL", "MSFT"],
      true,
    );
    expect(decision).toEqual({
      committed: ["AAPL", "MSFT"],
      bufferedPending: null,
    });
  });

  it("two rapid rank flips while gliding coalesce to a SINGLE buffered commit — the intermediate order is dropped", () => {
    // First flip arrives mid-glide: buffered, nothing committed yet.
    let decision = coalesceOrder(
      ["AAPL", "MSFT", "TSLA"],
      null,
      ["MSFT", "AAPL", "TSLA"],
      true,
    );
    expect(decision.committed).toEqual(["AAPL", "MSFT", "TSLA"]);
    expect(decision.bufferedPending).toEqual(["MSFT", "AAPL", "TSLA"]);

    // A SECOND flip arrives before the glide has settled — it supersedes the
    // first buffered candidate rather than stacking a second reorder.
    decision = coalesceOrder(
      decision.committed,
      decision.bufferedPending,
      ["TSLA", "AAPL", "MSFT"],
      true,
    );
    expect(decision.committed).toEqual(["AAPL", "MSFT", "TSLA"]);
    expect(decision.bufferedPending).toEqual(["TSLA", "AAPL", "MSFT"]);
    // Once the in-flight glide settles, the hook applies ONLY this final
    // buffered order — one reorder total for two rapid rank flips, and the
    // intermediate ["MSFT", "AAPL", "TSLA"] is never rendered or glided to.
  });

  it("repeating the same already-buffered candidate doesn't churn the buffer", () => {
    const first = coalesceOrder(["AAPL"], null, ["MSFT"], true);
    const second = coalesceOrder(
      first.committed,
      first.bufferedPending,
      ["MSFT"],
      true,
    );
    expect(second).toEqual(first);
  });
});

describe("rowHeight", () => {
  function stubbedRow(top: number): HTMLElement {
    const el = document.createElement("div");

    el.getBoundingClientRect = (): DOMRect => {
      return { top } as DOMRect;
    };

    return el;
  }

  it("falls back to FALLBACK_ROW_HEIGHT with fewer than two rows — there's no gap to measure", () => {
    expect(rowHeight([])).toBe(52);
    expect(rowHeight([stubbedRow(0)])).toBe(52);
  });

  it("measures the gap between the first two rows' tops", () => {
    expect(rowHeight([stubbedRow(10), stubbedRow(60)])).toBe(50);
  });

  it("falls back to FALLBACK_ROW_HEIGHT when the measured gap is zero", () => {
    // Same top for both — e.g. rows haven't been laid out yet (0-height
    // container) — a zero/falsy delta must not glide by 0px forever.
    expect(rowHeight([stubbedRow(0), stubbedRow(0)])).toBe(52);
  });
});
