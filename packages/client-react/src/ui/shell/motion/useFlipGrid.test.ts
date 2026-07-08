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

  // PROTO useFlip.ts parity: sub-pixel nudges (< 0.5px on both axes) don't
  // glide — a re-render that barely moves a node shouldn't flicker.
  it("suppresses sub-pixel deltas on both axes", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([["EURUSD", { left: 0.3, top: -0.4 }]]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  it("keeps a delta when either axis moved at least half a pixel", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([["EURUSD", { left: 0.2, top: 12 }]]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -0.2, dy: -12 },
    ]);
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
      // PROTO motion/useFlip.ts glide: 440ms, cubic-bezier(.22,.85,.3,1).
      expect.objectContaining({
        duration: 440,
        easing: "cubic-bezier(.22,.85,.3,1)",
      }),
    );
  });

  // getBoundingClientRect includes in-flight WAAPI transforms, so a resize
  // refresh that lands MID-GLIDE would store a transformed rect as the next
  // FLIP's origin (reads as a snap). The refresh must be skipped while any
  // registered element still has a running animation.
  it("skips the resize re-measure while a glide is in flight", () => {
    const tile = makeTile();
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep]);
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(tile.el);
    rerender({ dep: "EUR" });

    // A glide is still running when the resize refresh fires: the mid-glide
    // rect (left=100) must NOT be stored as the new origin.
    tile.running = [{} as Animation];
    tile.rect.left = 100;
    window.dispatchEvent(new Event("resize"));

    // Glide over; the next deps change FLIPs from the last settled origin
    // (0 → 150 = -150px), not from the mid-glide rect (100 → 150 = -50px).
    tile.running = [];
    tile.rect.left = 150;
    rerender({ dep: "USD" });

    expect(tile.animate).toHaveBeenCalledWith(
      [{ transform: "translate(-150px, 0px)" }, { transform: "none" }],
      expect.objectContaining({ duration: 440 }),
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
  /** Animations getAnimations() reports as running on the element. */
  running: Animation[];
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
  const tile: FakeTile = { el, rect, animate, running: [] };
  el.getAnimations = (): Animation[] => {
    return tile.running;
  };
  return tile;
}
