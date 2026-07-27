import { act, cleanup, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartViewport } from "@rtc/motion-core";

import { useNavigatorBrush } from "./useNavigatorBrush";

const SERIES_LEN = 300;
const VIEWPORT: ChartViewport = { start: 240, end: 300 };
const STRIP_RECT = { left: 0, top: 0, width: 500, height: 32 } as DOMRect;

afterEach(() => {
  cleanup();
});

describe("useNavigatorBrush", () => {
  it("dragging the window body pans the viewport WITH the pointer", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      // dx −50px of 500 → −0.1 × 300 = −30 candles, window follows the pointer left
      result.current.stripProps.onPointerMove(moveEvent(400));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 270 });
  });

  it("dragging the right handle resizes only the end edge", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("handle-right", 500));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(450));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 240, end: 270 });
  });

  it("dragging the left handle resizes only the start edge", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("handle-left", 400));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(350));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 300 });
  });

  it("a track pointerdown recentres the window immediately, then keeps dragging it", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      // 250 / 500 → idx 150 → centred {120, 180}
      result.current.stripProps.onPointerDown(brushEvent("track", 250));
    });
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 120, end: 180 });

    act(() => {
      // +50px → +30 candles from the RECENTRED origin
      result.current.stripProps.onPointerMove(moveEvent(300));
    });
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 150, end: 210 });
  });

  it("moves recompute from the fixed drag origin, not cumulatively", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(400));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(425));
    });

    // −25px total from origin → −15 candles, NOT −30 −15.
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 225, end: 285 });
  });

  it("pointer moves without a prior pointerdown are ignored", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(400));
    });

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("pointerup ends the drag; pointercancel does the same (no phantom drag)", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      result.current.stripProps.onPointerCancel(brushEvent("window", 450));
    });
    applyViewport.mockClear();

    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(100));
    });

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("captures the pointer on pointerdown", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });
    const event = brushEvent("window", 450);

    act(() => {
      result.current.stripProps.onPointerDown(event);
    });

    expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("endBrush ignores a pointerup with no active drag, or one for a different pointerId than the active drag", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    // No prior pointerdown at all: originRef.current is null.
    act(() => {
      result.current.stripProps.onPointerUp(brushEvent("window", 450));
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    applyViewport.mockClear();

    // A pointerup for a DIFFERENT pointerId than the active drag must not
    // end it — the still-active drag (pointerId 1) keeps responding to moves.
    act(() => {
      result.current.stripProps.onPointerUp({
        ...brushEvent("window", 450),
        pointerId: 2,
      });
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(400));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 270 });
  });
});

/** What the pointerdown landed on: the window body, a handle, or the bare
 * track — expressed through the `closest()` answers the hook's hit-test
 * makes (`[data-nav-edge]` first, then the window testid). */
type HitTarget = "window" | "handle-left" | "handle-right" | "track";

/** The return type of a closest() result, extracted to avoid inline object
 * type annotations. */
interface HitTargetElement {
  readonly closest: (sel: string) => unknown;
}

function hitTargetEl(hit: HitTarget): HitTargetElement {
  return {
    closest: (sel: string): unknown => {
      if (sel === "[data-nav-edge]") {
        if (hit === "handle-left") {
          return {
            getAttribute: (): string => {
              return "start";
            },
          };
        }

        if (hit === "handle-right") {
          return {
            getAttribute: (): string => {
              return "end";
            },
          };
        }

        return null;
      }

      if (sel === '[data-testid="navigator-window"]') {
        return hit === "window" ? {} : null;
      }

      return null;
    },
  };
}

function brushEvent(
  hit: HitTarget,
  clientX: number,
): ReactPointerEvent<HTMLDivElement> {
  return {
    pointerId: 1,
    clientX,
    target: hitTargetEl(hit),
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: (): boolean => {
        return true;
      },
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: (): DOMRect => {
        return STRIP_RECT;
      },
    } as unknown as HTMLDivElement,
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

function moveEvent(clientX: number): ReactPointerEvent<HTMLDivElement> {
  return brushEvent("track", clientX);
}
