import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFlipGrid } from "./useFlipGrid";

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

  // PROTO _flip enter branch: an item with no previous rect pops in — from
  // the stage's right border (dx = stage.right - item.right), fading and
  // scaling up, with the glide's duration/easing.
  it("plays the enter animation for newly-appearing items when enabled", () => {
    const stage = makeStage({ right: 900, bottom: 600 });
    const first = makeTile();
    stage.el.appendChild(first.el);
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep], { enter: true });
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(first.el);
    rerender({ dep: "EUR" });

    // A second tile appears at left=300 (right edge also 300 — zero-size
    // fake rects) with no stored origin: it must slide in from the stage's
    // right border (900 - 300 = 600px) with the scale/fade keyframes.
    const entering = makeTile();
    entering.rect.left = 300;
    stage.el.appendChild(entering.el);
    result.current.register("GBPUSD")(entering.el);
    rerender({ dep: "USD" });

    expect(entering.animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translate(600px, 0) scale(0.78)" },
        { opacity: 1, transform: "none" },
      ],
      expect.objectContaining({ duration: 440 }),
    );
  });

  // Fallback arms: no [data-flip-stage] ancestor and no parent → entering
  // items drift a fixed 32px; exiting ghosts fall the same fixed distance
  // when no surviving element can locate a stage either.
  it("falls back to the fixed drift when no stage exists", async () => {
    const first = makeTile();
    const leaving = makeTile();

    leaving.animate.mockReturnValue({ finished: Promise.resolve() });

    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep], { enter: true, exit: true });
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(first.el);
    result.current.register("GBPUSD")(leaving.el);
    rerender({ dep: "EUR" });

    // GBPUSD leaves; a fresh EURJPY enters. Neither element is inside a
    // [data-flip-stage] container (detached nodes), so both use DRIFT_PX.
    result.current.register("GBPUSD")(null);
    const entering = makeTile();
    result.current.register("EURJPY")(entering.el);
    rerender({ dep: "USD" });

    expect(entering.animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translate(32px, 0) scale(0.78)" },
        { opacity: 1, transform: "none" },
      ],
      expect.objectContaining({ duration: 440 }),
    );
    expect(leaving.animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: "translate(0, 0) scale(1)" },
        { opacity: 0, transform: "translate(0, 32px) scale(0.78)" },
      ],
      expect.objectContaining({ duration: 340 }),
    );
    await Promise.resolve();
  });

  it("tolerates unregistering a key that never had an element", () => {
    const { result } = renderHook(() => {
      return useFlipGrid(["All"]);
    });

    expect(() => {
      result.current.register("EURUSD")(null);
    }).not.toThrow();
  });

  it("works without ResizeObserver (older engines)", () => {
    const original = globalThis.ResizeObserver;
    // @ts-expect-error deliberately removing the global for the fallback arm
    delete globalThis.ResizeObserver;

    const tile = makeTile();
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep]);
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(tile.el);
    rerender({ dep: "EUR" });

    tile.rect.left = 80;
    rerender({ dep: "USD" });
    expect(tile.animate).toHaveBeenCalled();

    globalThis.ResizeObserver = original;
  });

  it("does not play enter animations when the option is off", () => {
    const first = makeTile();
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep]);
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(first.el);
    rerender({ dep: "EUR" });

    const entering = makeTile();
    result.current.register("GBPUSD")(entering.el);
    rerender({ dep: "USD" });

    expect(entering.animate).not.toHaveBeenCalled();
  });

  // An item removed by the filter is already unmounted when the FLIP pass
  // runs; its last DOM node is re-appended to <body> as a fixed-position
  // ghost at its old rect and falls to the stage's bottom border while
  // fading (PROTO cardOut geometry).
  it("fades a body-appended ghost out at the old position when exit is enabled", async () => {
    const stage = makeStage({ right: 900, bottom: 600 });
    const survivor = makeTile();
    const leaving = makeTile();
    leaving.rect.left = 300;
    leaving.rect.top = 100;
    leaving.el.setAttribute("data-testid", "tile-GBPUSD");
    const leavingChild = document.createElement("span");
    leavingChild.setAttribute("data-testid", "tile-GBPUSD-price");
    leaving.el.appendChild(leavingChild);
    stage.el.appendChild(survivor.el);
    stage.el.appendChild(leaving.el);

    let finishGhost: (() => void) | undefined;
    leaving.animate.mockReturnValue({
      finished: new Promise<void>((resolve) => {
        finishGhost = resolve;
      }),
    });

    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useFlipGrid([props.dep], { exit: true });
      },
      { initialProps: { dep: "All" } },
    );
    result.current.register("EURUSD")(survivor.el);
    result.current.register("GBPUSD")(leaving.el);
    rerender({ dep: "EUR" });

    // The filter drops GBPUSD: React unmounts it (ref cleanup) and the node
    // leaves the DOM before the next FLIP pass.
    leaving.el.remove();
    result.current.register("GBPUSD")(null);
    rerender({ dep: "USD" });

    // Ghost: re-appended to body, pinned at its old rect, falling to the
    // stage's bottom border (600 - (100 + 0 height) = 500px) while fading.
    expect(leaving.el.parentElement).toBe(document.body);
    expect(leaving.el.style.position).toBe("fixed");
    expect(leaving.el.style.left).toBe("300px");
    expect(leaving.el.style.top).toBe("100px");

    // Visual chrome only: hidden from assistive tech, and stripped of every
    // test id so e2e tile counts don't see it during its 340ms fade.
    expect(leaving.el.getAttribute("aria-hidden")).toBe("true");
    expect(leaving.el.hasAttribute("data-testid")).toBe(false);
    expect(leaving.el.querySelectorAll("[data-testid]").length).toBe(0);
    expect(leaving.animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: "translate(0, 0) scale(1)" },
        { opacity: 0, transform: "translate(0, 500px) scale(0.78)" },
      ],
      expect.objectContaining({ duration: 340, fill: "forwards" }),
    );

    // The ghost removes itself once the fade settles.
    finishGhost?.();
    await Promise.resolve();
    expect(leaving.el.parentElement).toBeNull();
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

interface StageRect {
  right: number;
  bottom: number;
}

interface FakeStage {
  el: HTMLElement;
}

/** A [data-flip-stage] container with a stubbed rect — the panel body whose
 *  borders the enter/exit travel is measured against. Appended to the body so
 *  closest() finds it from registered tiles. */
function makeStage(rect: StageRect): FakeStage {
  const el = document.createElement("div");
  el.setAttribute("data-flip-stage", "");

  el.getBoundingClientRect = (): DOMRect => {
    return {
      left: 0,
      top: 0,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.right,
      height: rect.bottom,
      x: 0,
      y: 0,
      toJSON: (): unknown => {
        return {};
      },
    } as DOMRect;
  };

  document.body.appendChild(el);

  return { el };
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
