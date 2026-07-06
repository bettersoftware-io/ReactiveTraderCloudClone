import { describe, expect, it } from "vitest";

import { computeRankDirections } from "./useRankGlide";

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
