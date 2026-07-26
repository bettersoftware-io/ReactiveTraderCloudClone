import {
  type Accessor,
  createComputed,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import {
  type ChartViewport,
  clampViewport,
  defaultViewport,
  followLive,
  isAtLiveEdge,
  panBy,
  zoomAt,
} from "@rtc/motion-core";

/** Wheel/keyboard zoom step — one notch shrinks or grows the span 20%. */
const ZOOM_IN_FACTOR = 1 / 1.2;
const ZOOM_OUT_FACTOR = 1.2;
/** Arrow-key pan step, as a fraction of the current viewport span. */
const KEY_PAN_FRACTION = 0.1;
/** Keyboard zoom always anchors at the plot's centre (no cursor position). */
const KEY_ZOOM_ANCHOR = 0.5;

/** The hovered plot position, as fractions (0-1) of the plot box. */
export interface ChartCursor {
  readonly xFrac: number;
  readonly yFrac: number;
}

/** Event handlers to spread onto the plot wrapper div. */
export interface ChartPlotProps {
  readonly onPointerDown: (e: PointerEvent) => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly onPointerUp: (e: PointerEvent) => void;
  readonly onPointerCancel: (e: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly onDblClick: () => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
}

export interface ChartGestures {
  readonly viewport: Accessor<ChartViewport>;
  readonly cursor: Accessor<ChartCursor | null>;
  readonly atLiveEdge: Accessor<boolean>;
  readonly plotProps: ChartPlotProps;
  /** Attach via `ref={g.plotRef}` on the plot wrapper — the wheel listener
   *  attaches here. */
  readonly plotRef: (el: HTMLDivElement) => void;
  readonly resetToLive: () => void;
}

/** The drag-in-flight bookkeeping cached at pointerdown: the viewport the
 * drag started from, so every subsequent move recomputes from that fixed
 * origin (rather than accumulating deltas onto a moving viewport). */
interface DragOrigin {
  readonly pointerId: number;
  readonly startX: number;
  readonly rectWidth: number;
  readonly startViewport: ChartViewport;
}

/**
 * The equities chart plot's one stateful unit (ADR-005: a framework hook for
 * the DOM-edge-driven gesture seam, delegating all viewport math to the pure
 * `@rtc/motion-core` functions). Owns the zoom/pan viewport and the
 * crosshair cursor position; wires pointer drag, wheel zoom, keyboard
 * pan/zoom, and double-click-to-reset into that state.
 *
 * SOLID PORT NOTE: the React original folds series-length growth in via the
 * "adjust state during render" recipe (a stored `prevLen` state compared
 * during render). Solid has no render phase to hook that into — instead a
 * `createComputed` (the primitive built for exactly this "run before
 * dependents observe the new value" ordering) watches `seriesLen()` directly
 * and folds each transition through `followLive` the moment it changes. The
 * wheel listener needs no analogous `[seriesLen]`-keyed re-bind either: it
 * closes over the `seriesLen` ACCESSOR and calls it fresh on every notch, so
 * one `onMount` (not an effect re-run per length change) is enough.
 */
export function createChartGestures(
  seriesLen: Accessor<number>,
  defaultVisible: Accessor<number>,
): ChartGestures {
  const [viewport, setViewport] = createSignal<ChartViewport>(
    defaultViewport(seriesLen(), defaultVisible()),
  );
  const [cursor, setCursor] = createSignal<ChartCursor | null>(null);
  let plotEl: HTMLDivElement | undefined;
  let dragOrigin: DragOrigin | null = null;

  // New candles arriving (seriesLen grows tick-by-tick) fold in via a
  // createComputed watching the live length directly: a live-edge viewport
  // slides with the new bars; a panned-away one holds still so the user's
  // view doesn't jump. Seeded with the CURRENT seriesLen() so the first run
  // (prevLen === len) is a no-op, matching the initial state above.
  createComputed((prevLen: number) => {
    const len = seriesLen();

    if (len !== prevLen) {
      setViewport((vp) => {
        return followLive(vp, prevLen, len);
      });
    }

    return len;
  }, seriesLen());

  // A native listener (not Solid's `on:wheel`, which is just as passive as
  // React's synthetic onWheel) is the only way to actually block the page
  // scroll while the wheel zooms the plot — `preventDefault()` on a
  // passively-registered listener logs a console error instead of stopping
  // it. Attached once via onMount: by the time it runs, `plotRef` has
  // already been assigned (Solid assigns `ref=` synchronously during element
  // creation, before mount effects flush), so `plotEl` is populated here.
  onMount(() => {
    const maybeEl = plotEl;

    if (!maybeEl) {
      return;
    }

    // Re-bound to a plain HTMLDivElement-typed const: TS's null-narrowing of
    // `maybeEl` above doesn't carry into the nested closure below, since a
    // closure could in principle run after the outer narrowing no longer
    // holds — irrelevant here (this element never changes for the effect's
    // lifetime), but the declared (non-nullable) type on `el` is what makes
    // the closure type-check.
    const el: HTMLDivElement = maybeEl;

    function zoomByWheelNotch(e: WheelEvent): void {
      e.preventDefault();
      // `e.offsetX` is relative to `e.target` — since BackToLiveButton (and
      // any other overlay) paints above this element, wheeling over it would
      // read offsetX against the BUTTON's box, not the plot's, anchoring the
      // zoom at the wrong point (typically the far left). Compute the
      // fraction against the plot element's own rect instead.
      const rect = el.getBoundingClientRect();
      const anchorFrac = (e.clientX - rect.left) / rect.width;
      const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
      setViewport((vp) => {
        return zoomAt(vp, anchorFrac, factor, seriesLen());
      });
    }

    el.addEventListener("wheel", zoomByWheelNotch, { passive: false });

    onCleanup(() => {
      el.removeEventListener("wheel", zoomByWheelNotch);
    });
  });

  function plotRef(el: HTMLDivElement): void {
    plotEl = el;
  }

  function startDrag(e: PointerEvent): void {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();

    dragOrigin = {
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport: viewport(),
    };
    target.setPointerCapture(e.pointerId);
  }

  function dragOrTrackCursor(e: PointerEvent): void {
    const drag = dragOrigin;

    if (drag && drag.pointerId === e.pointerId) {
      const span = drag.startViewport.end - drag.startViewport.start;
      const dxPx = e.clientX - drag.startX;
      setViewport(
        panBy(drag.startViewport, -(dxPx / drag.rectWidth) * span, seriesLen()),
      );
      return;
    }

    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    setCursor({
      xFrac: (e.clientX - rect.left) / rect.width,
      yFrac: (e.clientY - rect.top) / rect.height,
    });
  }

  function endDrag(e: PointerEvent): void {
    if (dragOrigin?.pointerId !== e.pointerId) {
      return;
    }

    dragOrigin = null;

    const target = e.currentTarget as HTMLDivElement;

    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  }

  function clearCursor(): void {
    setCursor(null);
  }

  function resetToLive(): void {
    setViewport(defaultViewport(seriesLen(), defaultVisible()));
  }

  function panOrZoomByKey(e: KeyboardEvent): void {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return panBy(vp, -span * KEY_PAN_FRACTION, seriesLen());
        });
        return;
      case "ArrowRight":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return panBy(vp, span * KEY_PAN_FRACTION, seriesLen());
        });
        return;
      case "+":
      case "=":
        e.preventDefault();
        setViewport((vp) => {
          return zoomAt(vp, KEY_ZOOM_ANCHOR, ZOOM_IN_FACTOR, seriesLen());
        });
        return;
      case "-":
        e.preventDefault();
        setViewport((vp) => {
          return zoomAt(vp, KEY_ZOOM_ANCHOR, ZOOM_OUT_FACTOR, seriesLen());
        });
        return;
      case "Home":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return clampViewport({ start: 0, end: span }, seriesLen());
        });
        return;
      case "End":
        e.preventDefault();
        resetToLive();
        return;
      default:
        return;
    }
  }

  const atLiveEdge = createMemo(() => {
    return isAtLiveEdge(viewport(), seriesLen());
  });

  return {
    viewport,
    cursor,
    atLiveEdge,
    plotProps: {
      onPointerDown: startDrag,
      onPointerMove: dragOrTrackCursor,
      onPointerUp: endDrag,
      // A pointercancel (browser-initiated gesture takeover, e.g. a
      // scroll/refresh gesture on a touchpad) never fires pointerup — without
      // this, dragOrigin stays populated and the next hover (same, stable
      // pointerId for a mouse) resumes a phantom drag from the stale origin.
      onPointerCancel: endDrag,
      onPointerLeave: clearCursor,
      onDblClick: resetToLive,
      onKeyDown: panOrZoomByKey,
    },
    plotRef,
    resetToLive,
  };
}
