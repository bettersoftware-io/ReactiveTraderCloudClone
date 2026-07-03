import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  computeRankDirections,
  useRankGlide,
} from "#/equities/Watchlist/useRankGlide";

afterEach(cleanup);

describe("computeRankDirections", () => {
  test("marks every row unchanged when there is no previous rank", () => {
    const directions = computeRankDirections(undefined, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "unchanged", MSFT: "unchanged" });
  });

  test("marks a row that moved to a smaller index as rose, a larger index as fell", () => {
    const prevRank = { AAPL: 1, MSFT: 0 };
    const directions = computeRankDirections(prevRank, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "rose", MSFT: "fell" });
  });

  test("marks a row at the same index as unchanged", () => {
    const prevRank = { AAPL: 0, MSFT: 1 };
    const directions = computeRankDirections(prevRank, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "unchanged", MSFT: "unchanged" });
  });
});

describe("useRankGlide", () => {
  test("plays a glide + highlight pair per re-ranked row, and skips entirely under reduce", () => {
    const container = document.createElement("div");
    const nodeA = document.createElement("button");
    nodeA.setAttribute("data-watch-sym", "AAPL");
    const nodeB = document.createElement("button");
    nodeB.setAttribute("data-watch-sym", "MSFT");
    container.append(nodeA, nodeB);
    document.body.append(container);

    // jsdom doesn't implement Element.animate — stub it so vi.spyOn has a
    // real method to wrap (the hook's try/catch means it works either way).
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = stubAnimate;
    }

    const animateSpy = vi.spyOn(Element.prototype, "animate");
    const rootRef = { current: container };

    const { rerender } = renderHook(
      (props: HarnessProps) => {
        useRankGlide(rootRef, props.order, props.reduce);
      },
      { initialProps: { order: ["AAPL", "MSFT"], reduce: false } },
    );

    act(() => {
      rerender({ order: ["MSFT", "AAPL"], reduce: false });
    });
    // two rows re-ranked * (glide + highlight) = 4 animate calls.
    expect(animateSpy).toHaveBeenCalledTimes(4);

    animateSpy.mockClear();
    act(() => {
      rerender({ order: ["AAPL", "MSFT"], reduce: true });
    });
    expect(animateSpy).not.toHaveBeenCalled();

    container.remove();
  });
});

interface HarnessProps {
  order: string[];
  reduce: boolean;
}

function stubAnimate(): Animation {
  return {} as unknown as Animation;
}
