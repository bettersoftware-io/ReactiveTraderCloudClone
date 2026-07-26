import { act, cleanup, render, renderHook } from "@testing-library/react";
import {
  createElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ChartGestures, useChartGestures } from "./useChartGestures";

const SERIES_LEN = 200;
const DEFAULT_VISIBLE = 50;

afterEach(() => {
  cleanup();
});

describe("useChartGestures", () => {
  it("starts with the newest defaultVisible candles in view", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.current.atLiveEdge).toBe(true);
    expect(result.current.cursor).toBeNull();
  });

  it("ArrowLeft pans the viewport left by 10% of its span", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const before = result.current.viewport;

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("ArrowLeft"));
    });

    const span = before.end - before.start;
    expect(result.current.viewport).toEqual({
      start: before.start - span * 0.1,
      end: before.end - span * 0.1,
    });
    expect(result.current.atLiveEdge).toBe(false);
  });

  it("ArrowRight pans the viewport right, clamped back to the live edge", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("ArrowRight"));
    });

    // Already at the live edge — panning further right stays clamped there.
    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
  });

  it("'+' zooms in: the span shrinks, still respecting the min-span clamp", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    const beforeSpan =
      result.current.viewport.end - result.current.viewport.start;

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("+"));
    });

    const afterSpan =
      result.current.viewport.end - result.current.viewport.start;
    expect(afterSpan).toBeLessThan(beforeSpan);
    expect(afterSpan).toBeGreaterThanOrEqual(5); // MIN_VIEWPORT_SPAN
  });

  it("'-' zooms out: the span grows", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    const beforeSpan =
      result.current.viewport.end - result.current.viewport.start;

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("-"));
    });

    const afterSpan =
      result.current.viewport.end - result.current.viewport.start;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });

  it("repeated zoom-in never shrinks the span below MIN_VIEWPORT_SPAN", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.plotProps.onKeyDown(keyEvent("+"));
      });
    }

    const span = result.current.viewport.end - result.current.viewport.start;
    expect(span).toBeGreaterThanOrEqual(5);
  });

  it("Home jumps the viewport to the start of the series, same span", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const span = result.current.viewport.end - result.current.viewport.start;

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });

    expect(result.current.viewport).toEqual({ start: 0, end: span });
    expect(result.current.atLiveEdge).toBe(false);
  });

  it("End (and resetToLive) restores the default live-edge viewport after panning away", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("ArrowLeft"));
    });
    expect(result.current.atLiveEdge).toBe(false);

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("End"));
    });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.current.atLiveEdge).toBe(true);
  });

  it("resetToLive() is also directly callable (double-click wires to it)", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });
    expect(result.current.atLiveEdge).toBe(false);

    act(() => {
      result.current.resetToLive();
    });

    expect(result.current.atLiveEdge).toBe(true);
  });

  it("an unhandled key is a no-op and does not preventDefault", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const before = result.current.viewport;
    const event = keyEvent("a");

    act(() => {
      result.current.plotProps.onKeyDown(event);
    });

    expect(result.current.viewport).toEqual(before);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("series growth while at the live edge slides the window forward", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE);
      },
      { initialProps: { seriesLen: SERIES_LEN } },
    );

    rerender({ seriesLen: SERIES_LEN + 5 });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
    expect(result.current.atLiveEdge).toBe(true);
  });

  it("series growth while panned away holds the viewport still", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE);
      },
      { initialProps: { seriesLen: SERIES_LEN } },
    );

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });
    const panned = result.current.viewport;

    rerender({ seriesLen: SERIES_LEN + 5 });

    expect(result.current.viewport).toEqual(panned);
    expect(result.current.atLiveEdge).toBe(false);
  });

  it("pointer drag pans the viewport by the dragged fraction of its width", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const before = result.current.viewport;

    act(() => {
      result.current.plotProps.onPointerDown(
        pointerEvent({ clientX: 50, clientY: 50 }),
      );
    });
    act(() => {
      // Dragging right (dx = +50 of 500px width) pans the view backward
      // (earlier) — plenty of room from the live edge, so nothing clamps.
      result.current.plotProps.onPointerMove(
        pointerEvent({ clientX: 100, clientY: 50 }),
      );
    });

    const span = before.end - before.start;
    const expectedStart = before.start - (50 / 500) * span;
    expect(result.current.viewport.start).toBeCloseTo(expectedStart, 5);
    expect(result.current.atLiveEdge).toBe(false);

    act(() => {
      result.current.plotProps.onPointerUp(
        pointerEvent({ clientX: 100, clientY: 50 }),
      );
    });
  });

  it("pointer move while NOT dragging sets the crosshair cursor fraction instead", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onPointerMove(
        pointerEvent({ clientX: 250, clientY: 25 }),
      );
    });

    expect(result.current.cursor).toEqual({ xFrac: 0.5, yFrac: 0.5 });
  });

  it("onPointerLeave clears the crosshair cursor", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onPointerMove(
        pointerEvent({ clientX: 250, clientY: 25 }),
      );
    });
    expect(result.current.cursor).not.toBeNull();

    act(() => {
      result.current.plotProps.onPointerLeave();
    });

    expect(result.current.cursor).toBeNull();
  });

  it("onDoubleClick resets the viewport to the live edge", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });
    expect(result.current.atLiveEdge).toBe(false);

    act(() => {
      result.current.plotProps.onDoubleClick();
    });

    expect(result.current.atLiveEdge).toBe(true);
  });

  it("wheel zoom attaches a non-passive native listener that zooms toward the cursor", () => {
    // A real render (not just renderHook) so plotRef attaches to an actual
    // DOM node before the effect runs — the wheel listener is a native
    // addEventListener, not React's synthetic (passive) onWheel, so it only
    // exists once the effect has fired against a populated ref. `box` (not a
    // plain `let`) so TS doesn't over-narrow the captured value to `null`
    // across the closure boundary.
    const box: GesturesBox = { gestures: null };
    const { getByTestId } = render(
      createElement(ChartGesturesHarness, {
        onReady: (g: ChartGestures) => {
          box.gestures = g;
        },
      }),
    );
    const el = getByTestId("plot");
    Object.defineProperty(el, "clientWidth", {
      value: 500,
      configurable: true,
    });

    const before = box.gestures?.viewport;
    expect(before).toBeDefined();

    act(() => {
      el.dispatchEvent(
        Object.assign(new Event("wheel", { cancelable: true }), {
          deltaY: -100,
          offsetX: 250,
        }),
      );
    });

    const afterSpan = box.gestures
      ? box.gestures.viewport.end - box.gestures.viewport.start
      : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeLessThan(beforeSpan);
  });

  it("wheel-down (deltaY > 0) zooms out", () => {
    const box: GesturesBox = { gestures: null };
    const { getByTestId } = render(
      createElement(ChartGesturesHarness, {
        onReady: (g: ChartGestures) => {
          box.gestures = g;
        },
      }),
    );
    const el = getByTestId("plot");
    Object.defineProperty(el, "clientWidth", {
      value: 500,
      configurable: true,
    });
    const before = box.gestures?.viewport;

    act(() => {
      el.dispatchEvent(
        Object.assign(new Event("wheel", { cancelable: true }), {
          deltaY: 100,
          offsetX: 250,
        }),
      );
    });

    const afterSpan = box.gestures
      ? box.gestures.viewport.end - box.gestures.viewport.start
      : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });
});

interface GesturesBox {
  gestures: ChartGestures | null;
}

/** Minimal harness: renders the plot div for real (ref + gesture props) and
 * reports the live ChartGestures snapshot back out on every render, so the
 * wheel-effect tests (which need a real DOM node under plotRef) can drive
 * and assert against it without a full CandleChart mount. */
interface ChartGesturesHarnessProps {
  onReady: (g: ChartGestures) => void;
}

function ChartGesturesHarness({
  onReady,
}: ChartGesturesHarnessProps): ReactElement {
  const g = useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
  onReady(g);
  return createElement("div", {
    "data-testid": "plot",
    ref: g.plotRef,
    tabIndex: 0,
    ...g.plotProps,
  });
}

interface HookProps {
  seriesLen: number;
}

function keyEvent(key: string): ReactKeyboardEvent<HTMLDivElement> {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLDivElement>;
}

interface PointerEventInit {
  clientX: number;
  clientY: number;
}

function pointerEvent(
  init: PointerEventInit,
): ReactPointerEvent<HTMLDivElement> {
  const rect = { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
  const currentTarget = {
    setPointerCapture: vi.fn(),
    getBoundingClientRect: () => {
      return rect;
    },
  } as unknown as HTMLDivElement;

  return {
    pointerId: 1,
    clientX: init.clientX,
    clientY: init.clientY,
    currentTarget,
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}
