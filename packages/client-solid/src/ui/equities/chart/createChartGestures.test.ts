import { batch, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { EqDrawTool } from "@rtc/client-core";
import type { DrawingGrip } from "@rtc/motion-core";

import { chartGesturesPage } from "#tests/ui/pages/CreateChartGesturesPage";

import type { DrawGestureSlots } from "./createChartGestures";

const SERIES_LEN = 200;
const DEFAULT_VISIBLE = 50;

const page = chartGesturesPage();

describe("createChartGestures", () => {
  it("starts with the newest defaultVisible candles in view", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
    expect(result.atLiveEdge()).toBe(true);
    expect(result.cursor()).toBeNull();
  });

  it("ArrowLeft pans the viewport left by 10% of its span", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    result.plotProps.onKeyDown(keyEvent("ArrowRight"));

    // Already at the live edge — panning further right stays clamped there.
    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE,
      end: SERIES_LEN,
    });
  });

  it("'+' zooms in: the span shrinks, still respecting the min-span clamp", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
    const before = result.viewport();
    const beforeSpan = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("+"));

    const after = result.viewport();
    const afterSpan = after.end - after.start;
    expect(afterSpan).toBeLessThan(beforeSpan);
    expect(afterSpan).toBeGreaterThanOrEqual(5); // MIN_VIEWPORT_SPAN
  });

  it("'-' zooms out: the span grows", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
    const before = result.viewport();
    const beforeSpan = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("-"));

    const after = result.viewport();
    const afterSpan = after.end - after.start;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });

  it("repeated zoom-in never shrinks the span below MIN_VIEWPORT_SPAN", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    for (let i = 0; i < 30; i++) {
      result.plotProps.onKeyDown(keyEvent("+"));
    }

    const vp = result.viewport();
    expect(vp.end - vp.start).toBeGreaterThanOrEqual(5);
  });

  it("Home jumps the viewport to the start of the series, same span", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
    const before = result.viewport();
    const span = before.end - before.start;

    result.plotProps.onKeyDown(keyEvent("Home"));

    expect(result.viewport()).toEqual({ start: 0, end: span });
    expect(result.atLiveEdge()).toBe(false);
  });

  it("End (and resetToLive) restores the default live-edge viewport after panning away", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    result.plotProps.onKeyDown(keyEvent("Home"));
    expect(result.atLiveEdge()).toBe(false);

    result.resetToLive();

    expect(result.atLiveEdge()).toBe(true);
  });

  it("an unhandled key is a no-op and does not preventDefault", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
    const before = result.viewport();
    const event = keyEvent("a");

    result.plotProps.onKeyDown(event);

    expect(result.viewport()).toEqual(before);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("series growth while at the live edge slides the window forward", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible);

    setSeriesLen(SERIES_LEN + 5);

    expect(result.viewport()).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
    expect(result.atLiveEdge()).toBe(true);
  });

  it("series growth while panned away holds the viewport still", () => {
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible);

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
    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible);

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

    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible, firstCandleTime);

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

    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible, firstCandleTime);

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
    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible, firstCandleTime);

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

    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(seriesLen, fixedDefaultVisible, firstCandleTime);

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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
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
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);
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

    expect(result.cursor()).toEqual({
      xFrac: 0.5,
      yFrac: 0.5,
      inPlot: true,
    });
  });

  it("pointer move while NOT dragging sets the crosshair cursor fraction instead", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    result.plotProps.onPointerMove(pointerEvent({ clientX: 250, clientY: 25 }));

    expect(result.cursor()).toEqual({
      xFrac: 0.5,
      yFrac: 0.5,
      inPlot: true,
    });
  });

  it("onPointerLeave clears the crosshair cursor", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    result.plotProps.onPointerMove(pointerEvent({ clientX: 250, clientY: 25 }));
    expect(result.cursor()).not.toBeNull();

    result.plotProps.onPointerLeave();

    expect(result.cursor()).toBeNull();
  });

  it("onDblClick resets the viewport to the live edge", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

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
    const harness = page.mountHarness(fixedSeriesLen, fixedDefaultVisible);
    const before = harness.state.viewport();
    const beforeSpan = before.end - before.start;

    // Guards the passive:false seam — a plain on:wheel binding would
    // register passively and preventDefault() there would be a silent no-op.
    const defaultPrevented = harness.dispatchWheel(-100, 250);

    const after = harness.state.viewport();
    const afterSpan = after.end - after.start;
    expect(afterSpan).toBeLessThan(beforeSpan);
    expect(defaultPrevented).toBe(true);
  });

  it("applyViewport sets the viewport (clamped), the navigator brush's write path", () => {
    const frames = captureAnimationFrames();

    try {
      const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

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
      const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

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
      const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

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
    const harness = page.mountHarness(fixedSeriesLen, fixedDefaultVisible);
    const before = harness.state.viewport();

    harness.dispatchWheel(100, 250);

    const after = harness.state.viewport();
    const afterSpan = after.end - after.start;
    const beforeSpan = before.end - before.start;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });
});

describe("createChartGestures — draw gesture fork", () => {
  it("hline: pointer-down commits the level immediately, with no capture and no draft", () => {
    const onCommitLevel = vi.fn();
    const setPointerCapture = vi.fn();
    const draw = drawSlots({ tool: "hline", onCommitLevel });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(
      pointerEvent({ clientX: 250, clientY: 25 }, { setPointerCapture }),
    );

    expect(onCommitLevel).toHaveBeenCalledWith({ xFrac: 0.5, yFrac: 0.5 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(result.draft()).toBeNull();
  });

  it("trendline: pointer-down opens a draft with both anchors at the down point, and captures the pointer", () => {
    const setPointerCapture = vi.fn();
    const draw = drawSlots({ tool: "trendline" });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(
      pointerEvent({ clientX: 100, clientY: 25 }, { setPointerCapture }),
    );

    const anchor = { xFrac: 0.2, yFrac: 0.5 };
    expect(result.draft()).toEqual({ a: anchor, b: anchor });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("trendline: every move updates the draft's b anchor while the crosshair keeps tracking", () => {
    const draw = drawSlots({ tool: "trendline" });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 200, clientY: 40 }));

    expect(result.draft()).toEqual({
      a: { xFrac: 0.2, yFrac: 0.5 },
      b: { xFrac: 0.4, yFrac: 0.8 },
    });
    expect(result.cursor()).toEqual({
      xFrac: 0.4,
      yFrac: 0.8,
      inPlot: true,
    });

    result.plotProps.onPointerUp(pointerEvent({ clientX: 200, clientY: 40 }));
  });

  it("trendline: pointer-up beyond CLICK_MAX_PX commits the line via onCommitLine and clears the draft", () => {
    const onCommitLine = vi.fn();
    const releasePointerCapture = vi.fn();
    const draw = drawSlots({ tool: "trendline", onCommitLine });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 200, clientY: 25 }));
    // 100px excursion from the (100, 25) down point — well beyond
    // CLICK_MAX_PX (4px).
    result.plotProps.onPointerUp(
      pointerEvent({ clientX: 200, clientY: 25 }, { releasePointerCapture }),
    );

    expect(onCommitLine).toHaveBeenCalledWith(
      { xFrac: 0.2, yFrac: 0.5 },
      { xFrac: 0.4, yFrac: 0.5 },
    );
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(result.draft()).toBeNull();
  });

  it("trendline: pointer-up within CLICK_MAX_PX discards the draft without committing", () => {
    const onCommitLine = vi.fn();
    const draw = drawSlots({ tool: "trendline", onCommitLine });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    // ~2.24px excursion — within the 4px click threshold: a stray click,
    // not a deliberate line.
    result.plotProps.onPointerUp(pointerEvent({ clientX: 102, clientY: 26 }));

    expect(onCommitLine).not.toHaveBeenCalled();
    expect(result.draft()).toBeNull();
  });

  it("pointercancel discards an open trendline draft without committing (same as a phantom-drag pan cancel)", () => {
    const onCommitLine = vi.fn();
    const releasePointerCapture = vi.fn();
    const draw = drawSlots({ tool: "trendline", onCommitLine });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 300, clientY: 25 }));
    result.plotProps.onPointerCancel(
      pointerEvent({ clientX: 300, clientY: 25 }, { releasePointerCapture }),
    );

    expect(onCommitLine).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(result.draft()).toBeNull();
  });

  it("Escape cancels an open trendline draft", () => {
    const onCommitLine = vi.fn();
    const draw = drawSlots({ tool: "trendline", onCommitLine });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    expect(result.draft()).not.toBeNull();

    const escapeKey = keyEvent("Escape");
    result.plotProps.onKeyDown(escapeKey);

    expect(result.draft()).toBeNull();
    expect(escapeKey.preventDefault).toHaveBeenCalled();

    // The eventual real pointerup for the now-cancelled gesture must not
    // resurrect or commit the discarded draft.
    result.plotProps.onPointerUp(pointerEvent({ clientX: 300, clientY: 25 }));
    expect(onCommitLine).not.toHaveBeenCalled();
  });

  it("Escape with no open draft is a no-op and does not preventDefault", () => {
    const draw = drawSlots({ tool: "cursor" });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const escapeKey = keyEvent("Escape");

    result.plotProps.onKeyDown(escapeKey);

    expect(escapeKey.preventDefault).not.toHaveBeenCalled();
  });

  it("cursor: pointer-up within CLICK_MAX_PX of its pointer-down calls onPlotClick with the up point's fraction", () => {
    const onPlotClick = vi.fn();
    const draw = drawSlots({ tool: "cursor", onPlotClick });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    result.plotProps.onPointerUp(pointerEvent({ clientX: 102, clientY: 26 }));

    expect(onPlotClick).toHaveBeenCalledWith({ xFrac: 0.204, yFrac: 0.52 });
  });

  it("cursor: a real drag beyond CLICK_MAX_PX pans as usual and does not call onPlotClick", () => {
    const onPlotClick = vi.fn();
    const draw = drawSlots({ tool: "cursor", onPlotClick });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const before = result.viewport();

    result.plotProps.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 100, clientY: 50 }));
    result.plotProps.onPointerUp(pointerEvent({ clientX: 100, clientY: 50 }));

    expect(result.viewport()).not.toEqual(before);
    expect(onPlotClick).not.toHaveBeenCalled();
  });

  it("Delete calls onDeleteKey while the cursor tool is active", () => {
    const onDeleteKey = vi.fn();
    const draw = drawSlots({ tool: "cursor", onDeleteKey });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const del = keyEvent("Delete");

    result.plotProps.onKeyDown(del);

    expect(onDeleteKey).toHaveBeenCalledOnce();
    expect(del.preventDefault).toHaveBeenCalled();
  });

  it("Backspace also calls onDeleteKey while the cursor tool is active", () => {
    const onDeleteKey = vi.fn();
    const draw = drawSlots({ tool: "cursor", onDeleteKey });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onKeyDown(keyEvent("Backspace"));

    expect(onDeleteKey).toHaveBeenCalledOnce();
  });

  it("Delete is a no-op while a non-cursor tool is active", () => {
    const onDeleteKey = vi.fn();
    const draw = drawSlots({ tool: "trendline", onDeleteKey });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const del = keyEvent("Delete");

    result.plotProps.onKeyDown(del);

    expect(onDeleteKey).not.toHaveBeenCalled();
    expect(del.preventDefault).not.toHaveBeenCalled();
  });

  it("with no draw slots passed at all, the primitive behaves exactly as the drawing-free signature (no draft, no crash)", () => {
    const result = page.mount(fixedSeriesLen, fixedDefaultVisible);

    expect(result.draft()).toBeNull();

    result.plotProps.onPointerDown(pointerEvent({ clientX: 100, clientY: 25 }));
    result.plotProps.onPointerUp(pointerEvent({ clientX: 101, clientY: 25 }));

    expect(result.draft()).toBeNull();
  });
});

describe("editDrag (drag-edit fork)", () => {
  // Harness notes: tool "cursor". hitGrip returns a grip for pointer-downs
  // inside the "grab zone" the test controls — simplest: a vi.fn() the test
  // programs per-case.

  it("pointer-down on a grip opens editDrag instead of a pan; moves track `to`; pointer-up beyond CLICK_MAX_PX commits once with (grip, from, to)", () => {
    const grip: DrawingGrip = { id: "d1", part: "b" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onCommitEdit = vi.fn();
    const draw = drawSlots({ tool: "cursor", hitGrip, onCommitEdit });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const before = result.viewport();

    // (250, 25) of the 500x50 stub rect -> plot fraction (0.5, 0.5).
    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));

    expect(result.editDrag()).not.toBeNull();
    expect(result.editDrag()?.from).toEqual({ xFrac: 0.5, yFrac: 0.5 });

    // (350, 15) -> (0.7, 0.3); a 100/10px excursion, well beyond
    // CLICK_MAX_PX.
    result.plotProps.onPointerMove(pointerEvent({ clientX: 350, clientY: 15 }));

    expect(result.editDrag()?.to).toEqual({ xFrac: 0.7, yFrac: 0.3 });

    result.plotProps.onPointerUp(pointerEvent({ clientX: 350, clientY: 15 }));

    expect(onCommitEdit).toHaveBeenCalledOnce();
    expect(onCommitEdit).toHaveBeenCalledWith(
      grip,
      { xFrac: 0.5, yFrac: 0.5 },
      { xFrac: 0.7, yFrac: 0.3 },
    );
    expect(result.editDrag()).toBeNull();
    // The pan path never ran — the viewport is exactly as it started.
    expect(result.viewport()).toEqual(before);
  });

  it("pointer-up within CLICK_MAX_PX discards the editDrag WITHOUT calling onPlotClick or onCommitEdit (the deselect trap)", () => {
    const grip: DrawingGrip = { id: "d1", part: "body" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onCommitEdit = vi.fn();
    const onPlotClick = vi.fn();
    const draw = drawSlots({
      tool: "cursor",
      hitGrip,
      onCommitEdit,
      onPlotClick,
    });

    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));
    // 1px excursion — well within CLICK_MAX_PX (4px).
    result.plotProps.onPointerUp(pointerEvent({ clientX: 251, clientY: 25 }));

    expect(onCommitEdit).not.toHaveBeenCalled();
    expect(onPlotClick).not.toHaveBeenCalled();
    expect(result.editDrag()).toBeNull();
  });

  it("Escape mid-editDrag discards it; the eventual stale pointer-up no-ops", () => {
    const grip: DrawingGrip = { id: "d1", part: "a" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onCommitEdit = vi.fn();
    const onPlotClick = vi.fn();
    const draw = drawSlots({
      tool: "cursor",
      hitGrip,
      onCommitEdit,
      onPlotClick,
    });

    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 350, clientY: 15 }));

    const escapeKey = keyEvent("Escape");
    result.plotProps.onKeyDown(escapeKey);

    expect(result.editDrag()).toBeNull();
    expect(escapeKey.preventDefault).toHaveBeenCalled();

    result.plotProps.onPointerUp(pointerEvent({ clientX: 350, clientY: 15 }));

    expect(onCommitEdit).not.toHaveBeenCalled();
    expect(onPlotClick).not.toHaveBeenCalled();
  });

  it("pointercancel mid-editDrag discards it", () => {
    const grip: DrawingGrip = { id: "d1", part: "level" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onCommitEdit = vi.fn();
    const releasePointerCapture = vi.fn();
    const draw = drawSlots({ tool: "cursor", hitGrip, onCommitEdit });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));
    result.plotProps.onPointerMove(pointerEvent({ clientX: 350, clientY: 15 }));
    result.plotProps.onPointerCancel(
      pointerEvent({ clientX: 350, clientY: 15 }, { releasePointerCapture }),
    );

    expect(result.editDrag()).toBeNull();
    expect(onCommitEdit).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    result.plotProps.onPointerUp(pointerEvent({ clientX: 350, clientY: 15 }));

    expect(onCommitEdit).not.toHaveBeenCalled();
  });

  it("hitGrip returning null falls through to the normal pan path (viewport changes on drag)", () => {
    const hitGrip = vi.fn().mockReturnValue(null);
    const onCommitEdit = vi.fn();
    const draw = drawSlots({ tool: "cursor", hitGrip, onCommitEdit });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
    const before = result.viewport();

    // (250, 25) -> 0.5 xFrac.
    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));
    // Dragging right (dx = +100 of 500px width) pans the view backward
    // (earlier) — away from the live edge, so nothing clamps it back to the
    // same window (unlike dragging toward the edge, which would).
    result.plotProps.onPointerMove(pointerEvent({ clientX: 350, clientY: 25 }));
    result.plotProps.onPointerUp(pointerEvent({ clientX: 350, clientY: 25 }));

    expect(result.editDrag()).toBeNull();
    expect(result.viewport().start).not.toEqual(before.start);
    expect(onCommitEdit).not.toHaveBeenCalled();
  });

  it("Delete/Backspace is ignored while an editDrag is open", () => {
    const grip: DrawingGrip = { id: "d1", part: "b" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onDeleteKey = vi.fn();
    const draw = drawSlots({ tool: "cursor", hitGrip, onDeleteKey });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));
    expect(result.editDrag()).not.toBeNull();

    const del = keyEvent("Delete");
    result.plotProps.onKeyDown(del);

    expect(onDeleteKey).not.toHaveBeenCalled();
    expect(del.preventDefault).not.toHaveBeenCalled();
  });

  it("hitGrip is only consulted when tool === 'cursor' (trendline tool pointer-down never calls it)", () => {
    const hitGrip = vi.fn();
    const draw = drawSlots({ tool: "trendline", hitGrip });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );

    result.plotProps.onPointerDown(pointerEvent({ clientX: 250, clientY: 25 }));

    expect(hitGrip).not.toHaveBeenCalled();
    // The trendline draft opened instead.
    expect(result.draft()).not.toBeNull();
    expect(result.editDrag()).toBeNull();
  });

  it("a pointer-down on a button descendant never consults hitGrip (button guard runs first)", () => {
    // Pins the GUARD ORDER, not just the guard's existence: unlike the
    // plain "lands on a nested button" test above (which mounts with no
    // draw slots at all), this one mounts WITH a cursor-tool hitGrip that
    // would happily return a grip — so if a future refactor ever hoisted
    // the grip check above the button guard, this is the test that would
    // catch it. Failure scenario it insures against: a selected drawing's
    // handle sitting under the BACK TO LIVE pill — a pointer-down there
    // would open an editDrag and capture-swallow the pill's click.
    const grip: DrawingGrip = { id: "d1", part: "b" };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const draw = drawSlots({ tool: "cursor", hitGrip });
    const result = page.mount(
      fixedSeriesLen,
      fixedDefaultVisible,
      undefined,
      draw,
    );
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

    expect(hitGrip).not.toHaveBeenCalled();
    expect(result.editDrag()).toBeNull();
    expect(setPointerCapture).not.toHaveBeenCalled();
  });
});

/** `drawSlots`' overrides — `tool` is a plain `EqDrawTool` here for test
 * readability, wrapped into the accessor `createChartGestures` actually
 * expects (see the SOLID PORT NOTE on `DrawGestureSlots.tool`). */
interface DrawSlotsOverrides extends Partial<Omit<DrawGestureSlots, "tool">> {
  tool?: EqDrawTool;
}

/** Builds a full `DrawGestureSlots`, every handler stubbed with a no-op
 * `vi.fn()` (`hitGrip` stubbed to always return `null`) — tests override
 * just the tool and whichever handler they assert against. */
function drawSlots(overrides: DrawSlotsOverrides): DrawGestureSlots {
  const { tool, ...handlerOverrides } = overrides;
  return {
    tool: () => {
      return tool ?? "cursor";
    },
    onCommitLine: vi.fn(),
    onCommitLevel: vi.fn(),
    onPlotClick: vi.fn(),
    hitGrip: () => {
      return null;
    },
    onCommitEdit: vi.fn(),
    onDeleteKey: vi.fn(),
    ...handlerOverrides,
  };
}

function fixedSeriesLen(): number {
  return SERIES_LEN;
}

function fixedDefaultVisible(): number {
  return DEFAULT_VISIBLE;
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

/** Optional spy overrides for the capture methods on the stubbed
 * `currentTarget` — the draw-gesture tests assert against these directly
 * (e.g. hline never calls `setPointerCapture`), while every other test
 * ignores them exactly as before (a fresh, unasserted `vi.fn()` each). */
interface PointerEventCaptureSpies {
  setPointerCapture?: ReturnType<typeof vi.fn>;
  releasePointerCapture?: ReturnType<typeof vi.fn>;
}

function pointerEvent(
  init: PointerEventInit,
  spies: PointerEventCaptureSpies = {},
): PointerEvent {
  const rect = { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
  const currentTarget = {
    setPointerCapture: spies.setPointerCapture ?? vi.fn(),
    hasPointerCapture: (): boolean => {
      return true;
    },
    releasePointerCapture: spies.releasePointerCapture ?? vi.fn(),
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
