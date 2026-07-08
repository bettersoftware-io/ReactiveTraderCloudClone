import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { flipDeltas, useFlipGrid } from "./useFlipGrid";

describe("flipDeltas", () => {
  it("computes inverse deltas for moved items and skips unmoved ones", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0 }],
      ["GBPUSD", { left: 320, top: 0 }],
    ]);
    const next = new Map([
      ["EURUSD", { left: 320, top: 0 }],
      ["GBPUSD", { left: 320, top: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -320, dy: 0 },
    ]);
  });

  it("omits keys that only exist in one of the two maps", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([
      ["EURUSD", { left: 0, top: 0 }],
      ["GBPUSD", { left: 300, top: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  it("computes both axes when an item moves diagonally", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([["EURUSD", { left: 300, top: 120 }]]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -300, dy: -120 },
    ]);
  });

  it("returns an empty array when nothing moved", () => {
    const prev = new Map([["EURUSD", { left: 10, top: 10 }]]);
    const next = new Map([["EURUSD", { left: 10, top: 10 }]]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });
});

describe("useFlipGrid", () => {
  it("re-measures origins on window resize so the next FLIP starts fresh", () => {
    const tile = makeTile();
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep]);
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(tile.el);

    // Settle the hook's stored origin at left=0 via a first deps change.
    rerender({ dep: "EUR" });

    // The grid moves WITHOUT a deps change (the window resizes)...
    tile.rect.left = 100;
    window.dispatchEvent(new Event("resize"));

    // ...then a real deps change moves it again. The FLIP must start from
    // the post-resize origin (100 → 150 = -50px), not the stale one (0).
    tile.rect.left = 150;
    rerender({ dep: "USD" });

    expect(tile.animate).toHaveBeenCalledWith(
      [{ transform: "translate(-50px, 0px)" }, { transform: "none" }],
      expect.objectContaining({ duration: 340 }),
    );
  });
});

interface HookProps {
  dep: string;
}

interface FakeTile {
  el: HTMLElement;
  rect: { left: number; top: number };
  animate: ReturnType<typeof vi.fn>;
}

/** A registered grid item whose viewport position the test can move; jsdom
 *  has neither real layout nor WAAPI, so both are stubbed on the element. */
function makeTile(): FakeTile {
  const el = document.createElement("div");
  const rect = { left: 0, top: 0 };
  const animate = vi.fn();

  el.getBoundingClientRect = (): DOMRect => {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.left,
      bottom: rect.top,
      width: 0,
      height: 0,
      x: rect.left,
      y: rect.top,
      toJSON: (): unknown => {
        return {};
      },
    } as DOMRect;
  };

  Object.assign(el, { animate });
  return { el, rect, animate };
}
