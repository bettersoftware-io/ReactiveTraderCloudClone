import { render, renderHook } from "@solidjs/testing-library";
import { batch, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { type ChartGestures, createChartGestures } from "./createChartGestures";

const SERIES_LEN = 200;
const DEFAULT_VISIBLE = 50;

describe("createChartGestures", () => {
  it("starts with the newest defaultVisible candles in view", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.atLiveEdge()).toBe(true);
    expect(result.cursor()).toBeNull();
  });

  it("ArrowLeft pans the viewport left by 10% of its span", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();

    result.plotProps.onKeyDown(keyEvent("ArrowLeft"));

    const span = before.end - before.start;
    expect(result.viewport()).toEqual({
      start: before.start - span * 0.1,
      end: before.end - span * 0.1,
    });
    expect(result.atLiveEdge()).toBe(false);
  });

  it("ArrowRight pans the viewport right, clamped back to the live edge", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onKeyDown(keyEvent("ArrowRight"));

    // Already at the live edge — panning further right stays clamped there.
    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
  });

  it("'+' zooms in: the span shrinks, still respecting the min-span clamp", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();
    const beforeSpan = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("+"));

    const after = result.viewport();
    const afterSpan = after.end - after.start;
    expect(afterSpan).toBeLessThan(beforeSpan);
    expect(afterSpan).toBeGreaterThanOrEqual(5); // MIN_VIEWPORT_SPAN
  });

  it("'-' zooms out: the span grows", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();
    const beforeSpan = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("-"));

    const after = result.viewport();
    const afterSpan = after.end - after.start;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });

  it("repeated zoom-in never shrinks the span below MIN_VIEWPORT_SPAN", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    for (let i = 0; i < 30; i++) {
      result.plotProps.onKeyDown(keyEvent("+"));
    }

    const vp = result.viewport();
    expect(vp.end - vp.start).toBeGreaterThanOrEqual(5);
  });

  it("Home jumps the viewport to the start of the series, same span", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();
    const span = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("Home"));

    expect(result.viewport()).toEqual({ start: 0, end: span });
    expect(result.atLiveEdge()).toBe(false);
  });

  it("End (and resetToLive) restores the default live-edge viewport after panning away", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onKeyDown(keyEvent("ArrowLeft"));
    expect(result.atLiveEdge()).toBe(false);

    result.plotProps.onKeyDown(keyEvent("End"));

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.atLiveEdge()).toBe(true);
  });

  it("resetToLive() is also directly callable (double-click wires to it)", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onKeyDown(keyEvent("Home"));
    expect(result.atLiveEdge()).toBe(false);

    result.resetToLive();

    expect(result.atLiveEdge()).toBe(true);
  });

  it("an unhandled key is a no-op and does not preventDefault", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();
    const event = keyEvent("a");

    result.plotProps.onKeyDown(event);

    expect(result.viewport()).toEqual(before);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("series growth while at the live edge slides the window forward", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const { result } = renderHook(() => {
      return createChartGestures(seriesLen, fixedDefaultVisible);
    });

    setSeriesLen(SERIES_LEN + 5);

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
    expect(result.atLiveEdge()).toBe(true);
  });

  it("series growth while panned away holds the viewport still", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const { result } = renderHook(() => {
      return createChartGestures(seriesLen, fixedDefaultVisible);
    });

    result.plotProps.onKeyDown(keyEvent("Home"));
    const panned = result.viewport();

    setSeriesLen(SERIES_LEN + 5);

    expect(result.viewport()).toEqual(panned);
    expect(result.atLiveEdge()).toBe(false);
  });

  it("real candles landing after an initial empty series snap to the live-edge default, not a degenerate zero-width window", () => {
    // Regression: EqWorkspace's `useCandles` (solid-bindings' resource/store
    // equivalent of react-rxjs bind()) can start at `[]` on the very first
    // reactive run before the presenter's real emission is observed.
    // Naively `followLive`-ing that {0,0} initial viewport by the FULL new
    // length (a real symbol's series arriving) used to land on {200,200} —
    // width zero, permanently reading as "at the live edge" so the plot
    // could never pan away (the real-browser bug an e2e smoke caught,
    // since jsdom/testing-library component tests always mount with the
    // real series already in hand).
    const [seriesLen, setSeriesLen] = createSignal(0);
    const { result } = renderHook(() => {
      return createChartGestures(seriesLen, fixedDefaultVisible);
    });

    setSeriesLen(SERIES_LEN);

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.viewport().end - result.viewport().start).toBe(
      DEFAULT_VISIBLE,
    );
    expect(result.atLiveEdge()).toBe(true);
  });

  it("prepended candles shift a panned-away viewport so the same candles stay in view", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const [firstCandleTime, setFirstCandleTime] = createSignal<
      number | undefined
    >(1_000_000);

    const { result } = renderHook(() => {
      return createChartGestures(
        seriesLen,
        fixedDefaultVisible,
        firstCandleTime,
      );
    });

    result.plotProps.onKeyDown(keyEvent("Home"));
    const panned = result.viewport();

    // 300 older candles arrive: first time got OLDER, length grew by 300.
    // Batched so createComputed observes both signals' new values in the
    // same run, matching React's single simultaneous rerender.
    batch(() => {
      setSeriesLen(SERIES_LEN + 300);
      setFirstCandleTime(700_000);
    });

    expect(result.viewport()).toEqual({
      start: panned.start + 300,
      end: panned.end + 300,
    });
    expect(result.atLiveEdge()).toBe(false);
  });

  it("prepended candles keep an at-live-edge viewport at the edge", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const [firstCandleTime, setFirstCandleTime] = createSignal<
      number | undefined
    >(1_000_000);

    const { result } = renderHook(() => {
      return createChartGestures(
        seriesLen,
        fixedDefaultVisible,
        firstCandleTime,
      );
    });

    batch(() => {
      setSeriesLen(SERIES_LEN + 300);
      setFirstCandleTime(700_000);
    });

    expect(result.viewport()).toEqual({
      start: SERIES_LEN + 300 - DEFAULT_VISIBLE,
      end: SERIES_LEN + 300,
    });
    expect(result.atLiveEdge()).toBe(true);
  });

  it("appends with an unchanged firstCandleTime still follow the live edge (regression pin)", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const [firstCandleTime] = createSignal<number | undefined>(1_000_000);
    const { result } = renderHook(() => {
      return createChartGestures(
        seriesLen,
        fixedDefaultVisible,
        firstCandleTime,
      );
    });

    setSeriesLen(SERIES_LEN + 5);

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
  });

  it("C1: a prepend landing MID-DRAG shifts the cached drag origin, so the next move lands where the same drag delta would in the shifted frame (no snap-back)", () => {
    // Regression: the createComputed's `prepended` branch used to shift the
    // live `viewport` signal by +grewBy but leave `dragOrigin.startViewport`
    // untouched. The next pointermove's panBy(dragOrigin.startViewport, ...)
    // then recomputed an ABSOLUTE viewport from the STALE (unshifted) origin,
    // snapping the view back by `grewBy` candles and re-triggering the
    // near-edge fetch on every subsequent move of one continuous drag.
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const [firstCandleTime, setFirstCandleTime] = createSignal<
      number | undefined
    >(1_000_000);

    const { result } = renderHook(() => {
      return createChartGestures(
        seriesLen,
        fixedDefaultVisible,
        firstCandleTime,
      );
    });

    result.plotProps.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }));

    // A 300-candle backfill prepend lands mid-drag: first time got OLDER,
    // length grew by 300 — the same growth-direction fork as the render-time
    // series-growth tests above.
    batch(() => {
      setSeriesLen(SERIES_LEN + 300);
      setFirstCandleTime(700_000);
    });

    // Same drag delta as "pointer drag pans the viewport..." below (+50px of
    // 500px width) — dragging right pans backward (earlier).
    result.plotProps.onPointerMove(pointerEvent({ clientX: 100, clientY: 50 }));

    // Expected: the SAME candles stay under the drag (the shifted-frame
    // delta), not a snap back by 300 candles from the stale origin.
    const span = DEFAULT_VISIBLE;
    const expectedStart =
      SERIES_LEN + 300 - DEFAULT_VISIBLE - (50 / 500) * span;
    expect(result.viewport().start).toBeCloseTo(expectedStart, 5);

    result.plotProps.onPointerUp(pointerEvent({ clientX: 100, clientY: 50 }));
  });

  it("pointer drag pans the viewport by the dragged fraction of its width", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });
    const before = result.viewport();

    result.plotProps.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }));
    // Dragging right (dx = +50 of 500px width) pans the view backward
    // (earlier) — plenty of room from the live edge, so nothing clamps.
    result.plotProps.onPointerMove(pointerEvent({ clientX: 100, clientY: 50 }));

    const span = before.end - before.start;
    const expectedStart = before.start - (50 / 500) * span;
    expect(result.viewport().start).toBeCloseTo(expectedStart, 5);
    expect(result.atLiveEdge()).toBe(false);

    result.plotProps.onPointerUp(pointerEvent({ clientX: 100, clientY: 50 }));
  });

  it("pointerdown captures the pointer via setPointerCapture", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
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
    } as unknown as PointerEvent;

    result.plotProps.onPointerDown(event);

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("a pointerdown that lands on a nested button does not capture the pointer (lets the button's own click through)", () => {
    // Regression: `setPointerCapture` retargets every later pointer event
    // for this pointer — including the resulting click — to the plot
    // wrapper, no matter where inside it the pointer actually is. Left
    // unguarded, that silently swallowed the BACK TO LIVE button's click
    // in a real browser (jsdom's synthetic events don't model capture
    // retargeting, so no jsdom test ever saw it break — only a real-browser
    // e2e run did).
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
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
    } as unknown as PointerEvent;

    result.plotProps.onPointerDown(event);

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("onPointerCancel clears an in-flight drag and releases capture (same as onPointerUp)", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
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

    result.plotProps.onPointerDown({
      pointerId: 3,
      clientX: 10,
      clientY: 10,
      currentTarget,
    } as unknown as PointerEvent);

    result.plotProps.onPointerCancel({
      pointerId: 3,
      currentTarget,
    } as unknown as PointerEvent);

    expect(releasePointerCapture).toHaveBeenCalledWith(3);

    // The cancelled drag is gone — a subsequent move with the SAME pointerId
    // (stable for a mouse) must be treated as plain cursor tracking, not a
    // resumed phantom drag from the stale origin.
    result.plotProps.onPointerMove(pointerEvent({ clientX: 250, clientY: 25 }));

    expect(result.cursor()).toEqual({ xFrac: 0.5, yFrac: 0.5 });
  });

  it("pointer move while NOT dragging sets the crosshair cursor fraction instead", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onPointerMove(pointerEvent({ clientX: 250, clientY: 25 }));

    expect(result.cursor()).toEqual({ xFrac: 0.5, yFrac: 0.5 });
  });

  it("onPointerLeave clears the crosshair cursor", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onPointerMove(pointerEvent({ clientX: 250, clientY: 25 }));
    expect(result.cursor()).not.toBeNull();

    result.plotProps.onPointerLeave();

    expect(result.cursor()).toBeNull();
  });

  it("onDblClick resets the viewport to the live edge", () => {
    const { result } = renderHook(() => {
      return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
    });

    result.plotProps.onKeyDown(keyEvent("Home"));
    expect(result.atLiveEdge()).toBe(false);

    result.plotProps.onDblClick();

    expect(result.atLiveEdge()).toBe(true);
  });

  it("wheel zoom attaches a non-passive native listener that zooms toward the cursor and calls preventDefault", () => {
    // A real render (not just renderHook) so plotRef attaches to an actual
    // DOM node before onMount's wheel listener registers — the wheel
    // listener is a native addEventListener, not Solid's passive `on:wheel`,
    // so it only exists once mount has run against a populated ref.
    const box: GesturesBox = { gestures: null };
    const { getByTestId } = render(() => {
      return ChartGesturesHarness((g) => {
        box.gestures = g;
      });
    });
    const el = getByTestId("plot");
    stubPlotRect(el);

    const before = box.gestures?.viewport();
    expect(before).toBeDefined();

    const event = wheelEvent({ deltaY: -100, clientX: 250 });
    el.dispatchEvent(event);

    const after = box.gestures?.viewport();
    const afterSpan = after ? after.end - after.start : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeLessThan(beforeSpan);
    // Guards the passive:false seam — a plain on:wheel binding would
    // register passively and preventDefault() there would be a silent no-op.
    expect(event.defaultPrevented).toBe(true);
  });

  it("applyViewport sets the viewport (clamped), the navigator brush's write path", () => {
    const frames = captureAnimationFrames();

    try {
      const { result } = renderHook(() => {
        return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
      });

      result.applyViewport({ start: 100, end: 150 });
      expect(result.viewport()).toEqual({ start: 100, end: 150 });
      expect(result.atLiveEdge()).toBe(false);

      // A second write inside the same frame window coalesces — flush the
      // trailing frame before asserting the clamped result.
      result.applyViewport({ start: -10, end: 40 });
      frames.flush();
      expect(result.viewport()).toEqual({ start: 0, end: 50 });
    } finally {
      frames.restore();
    }
  });

  it("coalesces a drag burst: leading move applies synchronously, the rest collapse to one latest-wins write per frame", () => {
    const frames = captureAnimationFrames();

    try {
      const { result } = renderHook(() => {
        return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
      });

      result.plotProps.onPointerDown(
        pointerEvent({ clientX: 50, clientY: 50 }),
      );
      result.plotProps.onPointerMove(
        pointerEvent({ clientX: 60, clientY: 50 }),
      );

      const afterLeading = result.viewport().start;

      // Two more moves inside the same frame window: neither may write yet.
      result.plotProps.onPointerMove(
        pointerEvent({ clientX: 80, clientY: 50 }),
      );
      result.plotProps.onPointerMove(
        pointerEvent({ clientX: 100, clientY: 50 }),
      );
      expect(result.viewport().start).toBe(afterLeading);

      frames.flush();

      // The trailing frame applies only the LAST move's viewport (dx = +50
      // of 500px width against the drag-origin viewport).
      const span = DEFAULT_VISIBLE;
      expect(result.viewport().start).toBeCloseTo(
        SERIES_LEN - DEFAULT_VISIBLE - (50 / 500) * span,
        5,
      );
    } finally {
      frames.restore();
    }
  });

  it("a discrete reset drops the pending coalesced drag write instead of being overwritten a frame later", () => {
    const frames = captureAnimationFrames();

    try {
      const { result } = renderHook(() => {
        return createChartGestures(fixedSeriesLen, fixedDefaultVisible);
      });

      result.plotProps.onPointerDown(
        pointerEvent({ clientX: 50, clientY: 50 }),
      );
      result.plotProps.onPointerMove(
        pointerEvent({ clientX: 60, clientY: 50 }),
      );
      result.plotProps.onPointerMove(
        pointerEvent({ clientX: 90, clientY: 50 }),
      );
      result.plotProps.onPointerUp(pointerEvent({ clientX: 90, clientY: 50 }));

      result.resetToLive();
      frames.flush();

      // The reset stands: the pending move-to-90 write was dropped with the
      // frame, not applied on top of the reset.
      expect(result.viewport()).toEqual({
        start: SERIES_LEN - DEFAULT_VISIBLE,
        end: SERIES_LEN,
      });
      expect(result.atLiveEdge()).toBe(true);
    } finally {
      frames.restore();
    }
  });

  it("wheel-down (deltaY > 0) zooms out", () => {
    const box: GesturesBox = { gestures: null };
    const { getByTestId } = render(() => {
      return ChartGesturesHarness((g) => {
        box.gestures = g;
      });
    });
    const el = getByTestId("plot");
    stubPlotRect(el);
    const before = box.gestures?.viewport();

    el.dispatchEvent(wheelEvent({ deltaY: 100, clientX: 250 }));

    const after = box.gestures?.viewport();
    const afterSpan = after ? after.end - after.start : 0;
    const beforeSpan = before ? before.end - before.start : 0;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });
});

function fixedSeriesLen(): number {
  return SERIES_LEN;
}

function fixedDefaultVisible(): number {
  return DEFAULT_VISIBLE;
}

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

/** Minimal harness: builds the plot div for real (ref + gesture props) and
 * reports the live ChartGestures snapshot back out, so the wheel-effect
 * tests (which need a real DOM node under plotRef) can drive and assert
 * against it without a full CandleChart mount. A plain function returning a
 * DOM node — no JSX needed — is a valid Solid "component" for `render()`. */
function ChartGesturesHarness(
  onReady: (g: ChartGestures) => void,
): HTMLElement {
  const g = createChartGestures(fixedSeriesLen, fixedDefaultVisible);
  onReady(g);

  const el = document.createElement("div");
  el.setAttribute("data-testid", "plot");
  el.tabIndex = 0;
  g.plotRef(el);

  return el;
}

type FakeKeyboardEvent = KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
};

function keyEvent(key: string): FakeKeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as FakeKeyboardEvent;
}

interface PointerEventInit {
  clientX: number;
  clientY: number;
}

function pointerEvent(init: PointerEventInit): PointerEvent {
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
  } as unknown as PointerEvent;
}

interface CapturedFrames {
  readonly flush: () => void;
  readonly restore: () => void;
}

/** Replaces rAF with a manual queue so a test can flush the gesture seam's
 * trailing coalesced write deterministically. */
function captureAnimationFrames(): CapturedFrames {
  const realRequest = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  const queue = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const handle = nextHandle;

    nextHandle += 1;
    queue.set(handle, cb);

    return handle;
  };

  globalThis.cancelAnimationFrame = (handle: number): void => {
    queue.delete(handle);
  };

  return {
    flush: (): void => {
      const callbacks = [...queue.values()];

      queue.clear();

      for (const cb of callbacks) {
        cb(performance.now());
      }
    },
    restore: (): void => {
      globalThis.requestAnimationFrame = realRequest;
      globalThis.cancelAnimationFrame = realCancel;
    },
  };
}
