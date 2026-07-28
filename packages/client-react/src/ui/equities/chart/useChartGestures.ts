import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

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
interface ChartCursor {
  readonly xFrac: number;
  readonly yFrac: number;
}

/** Event handlers to spread onto the plot wrapper div. */
interface ChartPlotProps {
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onDoubleClick: () => void;
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

export interface ChartGestures {
  readonly viewport: ChartViewport;
  readonly cursor: ChartCursor | null;
  readonly atLiveEdge: boolean;
  readonly plotProps: ChartPlotProps;
  /** Attach to the plot wrapper — the wheel listener attaches here. */
  readonly plotRef: RefObject<HTMLDivElement | null>;
  readonly resetToLive: () => void;
  /** Sets the viewport directly (clamped) — the navigator brush's write
   * path into the plot's one viewport cell. */
  readonly applyViewport: (vp: ChartViewport) => void;
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
 */
export function useChartGestures(
  seriesLen: number,
  defaultVisible: number,
): ChartGestures {
  const [viewport, setViewport] = useState<ChartViewport>(() => {
    return defaultViewport(seriesLen, defaultVisible);
  });
  const [cursor, setCursor] = useState<ChartCursor | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);

  // New candles arriving (seriesLen grows tick-by-tick) fold in via React's
  // documented "adjust state during render" recipe (useTickFlash.ts's
  // documented recipe), not an effect: a live-edge viewport slides with the
  // new bars; a panned-away one holds still so the user's view doesn't jump.
  const [prevLen, setPrevLen] = useState(seriesLen);

  if (seriesLen !== prevLen) {
    setPrevLen(seriesLen);
    setViewport((vp) => {
      // prevLen === 0 is the react-rxjs bind() placeholder before the
      // candle presenter's (synchronous, but not yet delivered on this
      // component's first commit) real emission lands — not a genuine
      // one-tick delta. Treating it as one via `followLive` slides the
      // degenerate {0,0} initial viewport by the FULL new length, landing
      // on a zero-width window exactly at the series end: `resolveWindow`
      // then renders nothing (empty candles/labels/NaN prices) and
      // `isAtLiveEdge` reads permanently true, so the plot can never pan
      // away from "live" at all. Snap straight to the real default window
      // instead — this is the very first time real data exists, so there
      // is no panned-away position to preserve yet.
      if (prevLen === 0) {
        return defaultViewport(seriesLen, defaultVisible);
      }

      return followLive(vp, prevLen, seriesLen);
    });
  }

  // React's synthetic onWheel registers passively, so calling
  // preventDefault() there logs a console error instead of stopping the
  // page from scrolling. A native listener registered here with
  // { passive: false } is the only way to actually block that scroll while
  // the wheel zooms the plot.
  useEffect(() => {
    const maybeEl = plotRef.current;

    if (!maybeEl) {
      return undefined;
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
        return zoomAt(vp, anchorFrac, factor, seriesLen);
      });
    }

    el.addEventListener("wheel", zoomByWheelNotch, { passive: false });

    return () => {
      el.removeEventListener("wheel", zoomByWheelNotch);
    };
  }, [seriesLen]);

  function startDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    // A pointerdown that lands on an interactive descendant (currently: the
    // BACK TO LIVE pill) must let ITS click through untouched.
    // `setPointerCapture` below retargets every subsequent pointer event
    // for this pointer — including the resulting click — to
    // `e.currentTarget` (the plot wrapper) regardless of where inside it
    // the pointer actually is, which silently swallows that button's
    // onClick in a real browser. jsdom's synthetic pointer events don't
    // model capture retargeting, so this was invisible to every jsdom
    // component test — exactly the real-browser-only lifecycle an e2e
    // smoke exists to witness.
    if ((e.target as HTMLElement | null)?.closest("button")) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport: viewport,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function dragOrTrackCursor(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;

    if (drag && drag.pointerId === e.pointerId) {
      const span = drag.startViewport.end - drag.startViewport.start;
      const dxPx = e.clientX - drag.startX;
      setViewport(
        panBy(drag.startViewport, -(dxPx / drag.rectWidth) * span, seriesLen),
      );
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({
      xFrac: (e.clientX - rect.left) / rect.width,
      yFrac: (e.clientY - rect.top) / rect.height,
    });
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) {
      return;
    }

    dragRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function clearCursor(): void {
    setCursor(null);
  }

  function resetToLive(): void {
    setViewport(defaultViewport(seriesLen, defaultVisible));
  }

  function applyViewport(vp: ChartViewport): void {
    setViewport(clampViewport(vp, seriesLen));
  }

  function panOrZoomByKey(e: ReactKeyboardEvent<HTMLDivElement>): void {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return panBy(vp, -span * KEY_PAN_FRACTION, seriesLen);
        });
        return;
      case "ArrowRight":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return panBy(vp, span * KEY_PAN_FRACTION, seriesLen);
        });
        return;
      case "+":
      case "=":
        e.preventDefault();
        setViewport((vp) => {
          return zoomAt(vp, KEY_ZOOM_ANCHOR, ZOOM_IN_FACTOR, seriesLen);
        });
        return;
      case "-":
        e.preventDefault();
        setViewport((vp) => {
          return zoomAt(vp, KEY_ZOOM_ANCHOR, ZOOM_OUT_FACTOR, seriesLen);
        });
        return;
      case "Home":
        e.preventDefault();
        setViewport((vp) => {
          const span = vp.end - vp.start;
          return clampViewport({ start: 0, end: span }, seriesLen);
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

  return {
    viewport,
    cursor,
    atLiveEdge: isAtLiveEdge(viewport, seriesLen),
    plotProps: {
      onPointerDown: startDrag,
      onPointerMove: dragOrTrackCursor,
      onPointerUp: endDrag,
      // A pointercancel (browser-initiated gesture takeover, e.g. a
      // scroll/refresh gesture on a touchpad) never fires pointerup — without
      // this, dragRef stays populated and the next hover (same, stable
      // pointerId for a mouse) resumes a phantom drag from the stale origin.
      onPointerCancel: endDrag,
      onPointerLeave: clearCursor,
      onDoubleClick: resetToLive,
      onKeyDown: panOrZoomByKey,
    },
    plotRef,
    resetToLive,
    applyViewport,
  };
}
