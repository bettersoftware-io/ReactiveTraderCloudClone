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
export interface ChartCursor {
  readonly xFrac: number;
  readonly yFrac: number;
}

/** Event handlers to spread onto the plot wrapper div. */
export interface ChartPlotProps {
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
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

    function zoomOnWheel(e: WheelEvent): void {
      e.preventDefault();
      const anchorFrac = e.offsetX / el.clientWidth;
      const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
      setViewport((vp) => {
        return zoomAt(vp, anchorFrac, factor, seriesLen);
      });
    }

    el.addEventListener("wheel", zoomOnWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", zoomOnWheel);
    };
  }, [seriesLen]);

  function startDrag(e: ReactPointerEvent<HTMLDivElement>): void {
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
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }

  function clearCursor(): void {
    setCursor(null);
  }

  function resetToLive(): void {
    setViewport(defaultViewport(seriesLen, defaultVisible));
  }

  function panOrZoomOnKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
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
      onPointerLeave: clearCursor,
      onDoubleClick: resetToLive,
      onKeyDown: panOrZoomOnKeyDown,
    },
    plotRef,
    resetToLive,
  };
}
