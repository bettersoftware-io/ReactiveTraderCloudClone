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

  it("real candles landing after an initial empty series snap to the live-edge default, not a degenerate zero-width window", () => {
    // Regression: ChartPanel mounts CandleChart with whatever `useCandles`
    // (a react-rxjs bind()) currently holds, which can start at `[]` on the
    // very first commit before the presenter's real emission is observed.
    // Naively `followLive`-ing that {0,0} initial viewport by the FULL new
    // length (a real symbol's series arriving) used to land on {300,300} —
    // width zero, permanently reading as "at the live edge" so the plot
    // could never pan away (the real-browser bug an e2e smoke caught,
    // since jsdom component tests always mount with the real series
    // already in hand).
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE);
      },
      { initialProps: { seriesLen: 0 } },
    );

    rerender({ seriesLen: SERIES_LEN });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.current.viewport.end - result.current.viewport.start).toBe(
      DEFAULT_VISIBLE,
    );
    expect(result.current.atLiveEdge).toBe(true);
  });

  it("prepended candles shift a panned-away viewport so the same candles stay in view", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(
          props.seriesLen,
          DEFAULT_VISIBLE,
          props.firstCandleTime,
        );
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });
    const panned = result.current.viewport;

    // 300 older candles arrive: first time got OLDER, length grew by 300.
    rerender({ seriesLen: SERIES_LEN + 300, firstCandleTime: 700_000 });

    expect(result.current.viewport).toEqual({
      start: panned.start + 300,
      end: panned.end + 300,
    });
    expect(result.current.atLiveEdge).toBe(false);
  });

  it("prepended candles keep an at-live-edge viewport at the edge", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(
          props.seriesLen,
          DEFAULT_VISIBLE,
          props.firstCandleTime,
        );
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    rerender({ seriesLen: SERIES_LEN + 300, firstCandleTime: 700_000 });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN + 300 - DEFAULT_VISIBLE,
      end: SERIES_LEN + 300,
    });
    expect(result.current.atLiveEdge).toBe(true);
  });

  it("appends with an unchanged firstCandleTime still follow the live edge (regression pin)", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(
          props.seriesLen,
          DEFAULT_VISIBLE,
          props.firstCandleTime,
        );
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    rerender({ seriesLen: SERIES_LEN + 5, firstCandleTime: 1_000_000 });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
  });

  it("C1: a prepend landing MID-DRAG shifts the cached drag origin, so the next move lands where the same drag delta would in the shifted frame (no snap-back)", () => {
    // Regression: the render-adjust `prepended` branch used to shift the
    // live `viewport` state by +grewBy but leave `dragRef.current.startViewport`
    // untouched. The next pointermove's panBy(dragRef.current.startViewport, ...)
    // then recomputed an ABSOLUTE viewport from the STALE (unshifted) origin,
    // snapping the view back by `grewBy` candles and re-triggering the
    // near-edge fetch on every subsequent move of one continuous drag.
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(
          props.seriesLen,
          DEFAULT_VISIBLE,
          props.firstCandleTime,
        );
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    act(() => {
      result.current.plotProps.onPointerDown(
        pointerEvent({ clientX: 50, clientY: 50 }),
      );
    });

    // A 300-candle backfill prepend lands mid-drag: first time got OLDER,
    // length grew by 300 — the same growth-direction fork as the render-time
    // series-growth tests above.
    rerender({ seriesLen: SERIES_LEN + 300, firstCandleTime: 700_000 });

    act(() => {
      // Same drag delta as "pointer drag pans the viewport..." above (+50px
      // of 500px width) — dragging right pans backward (earlier).
      result.current.plotProps.onPointerMove(
        pointerEvent({ clientX: 100, clientY: 50 }),
      );
    });

    // Expected: the SAME candles stay under the drag (the shifted-frame
    // delta), not a snap back by 300 candles from the stale origin.
    const span = DEFAULT_VISIBLE;
    const expectedStart =
      SERIES_LEN + 300 - DEFAULT_VISIBLE - (50 / 500) * span;
    expect(result.current.viewport.start).toBeCloseTo(expectedStart, 5);

    act(() => {
      result.current.plotProps.onPointerUp(
        pointerEvent({ clientX: 100, clientY: 50 }),
      );
    });
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

  it("pointerdown captures the pointer via setPointerCapture", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const setPointerCapture = vi.fn();
    const event = {
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      currentTarget: {
        setPointerCapture,
        getBoundingClientRect: (): DOMRect => {
          return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
        },
      } as unknown as HTMLDivElement,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => {
      result.current.plotProps.onPointerDown(event);
    });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("a pointerdown that lands on a nested button does not capture the pointer (lets the button's own click through)", () => {
    // Regression: `setPointerCapture` retargets every later pointer event
    // for this pointer — including the resulting click — to the plot
    // wrapper, no matter where inside it the pointer actually is. Left
    // unguarded, that silently swallowed the BACK TO LIVE button's onClick
    // in a real browser (jsdom's synthetic events don't model capture
    // retargeting, so no jsdom test ever saw it break — only a real-browser
    // e2e run did).
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const setPointerCapture = vi.fn();
    const event = {
      pointerId: 9,
      clientX: 10,
      clientY: 10,
      target: {
        closest: (selector: string) => {
          return selector === "button" ? {} : null;
        },
      },
      currentTarget: {
        setPointerCapture,
        getBoundingClientRect: (): DOMRect => {
          return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
        },
      } as unknown as HTMLDivElement,
    } as unknown as ReactPointerEvent<HTMLDivElement>;

    act(() => {
      result.current.plotProps.onPointerDown(event);
    });

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("onPointerCancel clears an in-flight drag and releases capture (same as onPointerUp)", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });
    const releasePointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const currentTarget = {
      setPointerCapture: vi.fn(),
      hasPointerCapture,
      releasePointerCapture,
      getBoundingClientRect: (): DOMRect => {
        return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
      },
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.plotProps.onPointerDown({
        pointerId: 3,
        clientX: 10,
        clientY: 10,
        currentTarget,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });

    act(() => {
      result.current.plotProps.onPointerCancel({
        pointerId: 3,
        currentTarget,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });

    expect(releasePointerCapture).toHaveBeenCalledWith(3);

    // The cancelled drag is gone — a subsequent move with the SAME pointerId
    // (stable for a mouse) must be treated as plain cursor tracking, not a
    // resumed phantom drag from the stale origin.
    act(() => {
      result.current.plotProps.onPointerMove(
        pointerEvent({ clientX: 250, clientY: 25 }),
      );
    });

    expect(result.current.cursor).toEqual({
      xFrac: 0.5,
      yFrac: 0.5,
      inPlot: true,
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

    expect(result.current.cursor).toEqual({
      xFrac: 0.5,
      yFrac: 0.5,
      inPlot: true,
    });
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

  it("wheel zoom attaches a non-passive native listener that zooms toward the cursor and calls preventDefault", () => {
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
    stubPlotRect(el);

    const before = box.gestures?.viewport;
    expect(before).toBeDefined();

    const event = wheelEvent({ deltaY: -100, clientX: 250 });

    act(() => {
      el.dispatchEvent(event);
    });

    const afterSpan = box.gestures
      ? box.gestures.viewport.end - box.gestures.viewport.start
      : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeLessThan(beforeSpan);
    // Guards the passive:false seam — a plain onWheel prop would register
    // passively and preventDefault() there would be a silent no-op.
    expect(event.defaultPrevented).toBe(true);
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
    stubPlotRect(el);
    const before = box.gestures?.viewport;

    act(() => {
      el.dispatchEvent(wheelEvent({ deltaY: 100, clientX: 250 }));
    });

    const afterSpan = box.gestures
      ? box.gestures.viewport.end - box.gestures.viewport.start
      : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });

  it("applyViewport sets the viewport (clamped), the navigator brush's write path", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.applyViewport({ start: 100, end: 150 });
    });
    expect(result.current.viewport).toEqual({ start: 100, end: 150 });
    expect(result.current.atLiveEdge).toBe(false);

    // Out-of-bounds input clamps rather than escaping the series.
    act(() => {
      result.current.applyViewport({ start: -10, end: 40 });
    });
    expect(result.current.viewport).toEqual({ start: 0, end: 50 });
  });
});

/** Stubs a 500×50 rect at the origin for the plot div, standing in for the
 * real layout jsdom never computes (getBoundingClientRect() is all-zeros by
 * default there). */
function stubPlotRect(el: HTMLElement): void {
  el.getBoundingClientRect = (): DOMRect => {
    return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
  };
}

interface WheelEventInit {
  deltaY: number;
  clientX: number;
}

type FakeWheelEvent = Event & WheelEventInit;

function wheelEvent(init: WheelEventInit): FakeWheelEvent {
  return Object.assign(new Event("wheel", { cancelable: true }), {
    deltaY: init.deltaY,
    clientX: init.clientX,
  });
}

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
  firstCandleTime?: number;
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
    hasPointerCapture: (): boolean => {
      return true;
    },
    releasePointerCapture: vi.fn(),
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
