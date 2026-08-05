import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import type { EqDrawTool } from "@rtc/client-core";
import {
  type ChartViewport,
  clampViewport,
  defaultViewport,
  followLive,
  isAtLiveEdge,
  panBy,
  shiftForPrepend,
  zoomAt,
} from "@rtc/motion-core";

/** Wheel/keyboard zoom step — one notch shrinks or grows the span 20%. */
const ZOOM_IN_FACTOR = 1 / 1.2;
const ZOOM_OUT_FACTOR = 1.2;
/** Arrow-key pan step, as a fraction of the current viewport span. */
const KEY_PAN_FRACTION = 0.1;
/** Keyboard zoom always anchors at the plot's centre (no cursor position). */
const KEY_ZOOM_ANCHOR = 0.5;
/** Pointer-down→up excursion (client px, Euclidean) at or below which a
 * drawing gesture counts as a click rather than a drag: a "cursor" tool
 * pointer-up selects/deselects the hit drawing, a "trendline" draft within
 * this radius is discarded instead of committed. */
const CLICK_MAX_PX = 4;

/** The hovered plot position, as fractions (0-1) of the plot box.
 * `inPlot` is true only while the hover is over the main price plot itself
 * (never a pane) — it drives `CrosshairOverlay`'s `showHorizontal`, so the
 * main plot's horizontal hairline hides while a pane hover echoes the
 * crosshair's vertical line instead (`paneHoverProps` below always sets it
 * false). */
interface ChartCursor {
  readonly xFrac: number;
  readonly yFrac: number;
  readonly inPlot: boolean;
}

/** Event handlers for an indicator pane's root — pointermove tracks the
 * shared crosshair from the pane's own rect (fixed mid-height, `inPlot:
 * false`); pointerleave clears it, same as the main plot's own
 * `onPointerLeave`. Exported so `IndicatorPane` can type the prop it
 * receives via `ChartPlot`. */
export interface PaneHoverProps {
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerLeave: () => void;
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

/** A plot position as fractions (0-1) of the plot box — the coordinate
 * currency the draw gesture slots speak, so this hook stays free of any
 * data-space (candle index / price) knowledge; that projection is
 * `CandleChart`'s job via `pointerToAnchor`. */
export interface PlotFrac {
  readonly xFrac: number;
  readonly yFrac: number;
}

/** An in-progress trendline draft's two anchors, in plot-fraction space. */
export interface DrawDraft {
  readonly a: PlotFrac;
  readonly b: PlotFrac;
}

/** The drawing-tool gesture inputs — a slot object, so this hook stays
 * machine-agnostic (it never imports `@rtc/client-core`'s drawings machine,
 * only its `EqDrawTool` union). Optional on the hook: every existing call
 * site that doesn't draw keeps compiling untouched. */
export interface DrawGestureSlots {
  readonly tool: EqDrawTool;
  /** Commits a finished trendline drag (`tool === "trendline"`, excursion
   * beyond `CLICK_MAX_PX`). */
  readonly onCommitLine: (a: PlotFrac, b: PlotFrac) => void;
  /** Commits a level on pointer-down (`tool === "hline"`) — one anchor is
   * all it needs, so there is no drag/draft phase. */
  readonly onCommitLevel: (p: PlotFrac) => void;
  /** A `tool === "cursor"` pointer-up within `CLICK_MAX_PX` of its
   * pointer-down — a click, not a pan — hit-tests the click point. */
  readonly onPlotClick: (p: PlotFrac) => void;
  /** `Delete`/`Backspace` while `tool === "cursor"`. */
  readonly onDeleteKey: () => void;
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
  /** Attach to each indicator pane's root — see `PaneHoverProps`. */
  readonly paneHoverProps: PaneHoverProps;
  /** The in-progress trendline draft (`tool === "trendline"`, between
   * pointer-down and pointer-up), or `null` when none is open. `b` tracks
   * the pointer on every move; `CandleChart` projects both anchors through
   * `pointerToAnchor` and appends the result to the drawing scene as a
   * live preview. */
  readonly draft: DrawDraft | null;
}

/** The drag-in-flight bookkeeping cached at pointerdown: the viewport the
 * drag started from, so every subsequent move recomputes from that fixed
 * origin (rather than accumulating deltas onto a moving viewport). Also
 * doubles as the trendline-draft's pointer bookkeeping — `downClient` is
 * the click/drag excursion's origin, measured against the pointer-up
 * position to tell a click from a drag (`CLICK_MAX_PX`). */
interface DragOrigin {
  readonly pointerId: number;
  readonly startX: number;
  readonly rectWidth: number;
  readonly startViewport: ChartViewport;
  readonly downClient: { readonly x: number; readonly y: number };
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
  firstCandleTime?: number,
  draw?: DrawGestureSlots,
): ChartGestures {
  const [viewport, setViewport] = useState<ChartViewport>(() => {
    return defaultViewport(seriesLen, defaultVisible);
  });
  const [cursor, setCursor] = useState<ChartCursor | null>(null);
  const [draft, setDraft] = useState<DrawDraft | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);

  // New candles arriving (seriesLen grows tick-by-tick) fold in via React's
  // documented "adjust state during render" recipe (useTickFlash.ts's
  // documented recipe), not an effect: a live-edge viewport slides with the
  // new bars; a panned-away one holds still so the user's view doesn't jump.
  const [prevLen, setPrevLen] = useState(seriesLen);
  const [prevFirstTime, setPrevFirstTime] = useState(firstCandleTime);

  if (seriesLen !== prevLen || firstCandleTime !== prevFirstTime) {
    setPrevLen(seriesLen);
    setPrevFirstTime(firstCandleTime);
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

      // Growth DIRECTION fork: the series growing while its first candle
      // got OLDER is a backfill prepend — every index shifted, so the
      // viewport translates with them (holds a panned-away view still AND
      // keeps an at-edge view at the edge, one code path). Anything else
      // is the live append fold, unchanged.
      const grewBy = seriesLen - prevLen;
      const prepended =
        grewBy > 0 &&
        prevFirstTime !== undefined &&
        firstCandleTime !== undefined &&
        firstCandleTime < prevFirstTime;

      if (prepended) {
        // C1: a prepend landing MID-DRAG must also shift the drag's cached
        // origin, or the next pointermove's
        // panBy(dragRef.current.startViewport, ...) recomputes from a
        // viewport that no longer matches reality — snapping the view back
        // by `grewBy` candles and re-triggering the near-edge fetch on
        // every subsequent move, draining the whole depth cap in one
        // continuous drag. A ref write during render is safe here: it's the
        // same "adjust state during render" seam the setViewport calls
        // above already use (this whole block only runs when
        // seriesLen/firstCandleTime changed since the last render).
        if (dragRef.current) {
          dragRef.current = {
            ...dragRef.current,
            startViewport: shiftForPrepend(
              dragRef.current.startViewport,
              grewBy,
            ),
          };
        }

        return shiftForPrepend(vp, grewBy);
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

    // hline needs only the one point it just landed on — no capture, no
    // drag/draft phase, no pan bookkeeping at all.
    if (draw?.tool === "hline") {
      draw.onCommitLevel(plotFracOf(e));
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport: viewport,
      downClient: { x: e.clientX, y: e.clientY },
    };
    e.currentTarget.setPointerCapture(e.pointerId);

    if (draw?.tool === "trendline") {
      const anchor = plotFracOf(e);
      setDraft({ a: anchor, b: anchor });
    }
  }

  function dragOrTrackCursor(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;

    if (drag && drag.pointerId === e.pointerId) {
      // The trendline draft's second anchor tracks every move — the
      // crosshair keeps tracking alongside it (the aiming aid stays live
      // while placing a line), unlike a plain pan drag below, which leaves
      // the crosshair frozen at its pre-drag position as it always has.
      if (draft) {
        const anchor = plotFracOf(e);
        setDraft((d) => {
          return d ? { ...d, b: anchor } : d;
        });
        setCursor({ ...anchor, inPlot: true });
        return;
      }

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
      inPlot: true,
    });
  }

  /** Computes a plot-fraction position from a pointer event, against
   * `e.currentTarget`'s own rect — the same rule the crosshair tracker
   * above uses. Shared by the draw-gesture paths (draft open/track, click
   * hit-testing) below. */
  function plotFracOf(e: ReactPointerEvent<HTMLDivElement>): PlotFrac {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      xFrac: (e.clientX - rect.left) / rect.width,
      yFrac: (e.clientY - rect.top) / rect.height,
    };
  }

  // A pane's own hover: `yFrac` is pinned to mid-height (panes don't have a
  // meaningful vertical crosshair position) and `inPlot` is always false, so
  // the main plot's horizontal hairline hides in favour of the pane's own
  // crosshair echo. No wheel/drag gesture binds here — panes only ever
  // extend the shared xFrac cursor, never the viewport itself.
  function trackPaneCursor(e: ReactPointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({
      xFrac: (e.clientX - rect.left) / rect.width,
      yFrac: 0.5,
      inPlot: false,
    });
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;

    if (drag?.pointerId !== e.pointerId) {
      return;
    }

    dragRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const excursionPx = Math.hypot(
      e.clientX - drag.downClient.x,
      e.clientY - drag.downClient.y,
    );

    if (draft) {
      // Beyond the click threshold: a deliberate line. Within it: a stray
      // click drew nothing — discard either way, the draft is done.
      if (excursionPx > CLICK_MAX_PX) {
        draw?.onCommitLine(draft.a, draft.b);
      }

      setDraft(null);
      return;
    }

    if (draw?.tool === "cursor" && excursionPx <= CLICK_MAX_PX) {
      draw.onPlotClick(plotFracOf(e));
    }
  }

  // A pointercancel is an aborted gesture (browser-initiated takeover, e.g.
  // a scroll/refresh gesture on a touchpad), never a completed one — an
  // open trendline draft is discarded here too, never committed, unlike
  // `endDrag`'s click/drag fork above.
  function cancelDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) {
      return;
    }

    dragRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    setDraft(null);
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
      case "Escape":
        // No open draft: nothing to cancel, so no-op (same as any other
        // unhandled key — no preventDefault either).
        if (!draft) {
          return;
        }

        e.preventDefault();
        // The pointer may still be physically down (the user pressed
        // Escape mid-drag) — clearing dragRef here is enough: the eventual
        // real pointerup/pointercancel will see no matching drag and no-op,
        // and the browser releases its own capture on that event as usual.
        dragRef.current = null;
        setDraft(null);
        return;
      case "Delete":
      case "Backspace":
        if (draw?.tool !== "cursor") {
          return;
        }

        e.preventDefault();
        draw.onDeleteKey();
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
      onPointerCancel: cancelDrag,
      onPointerLeave: clearCursor,
      onDoubleClick: resetToLive,
      onKeyDown: panOrZoomByKey,
    },
    plotRef,
    resetToLive,
    applyViewport,
    paneHoverProps: {
      onPointerMove: trackPaneCursor,
      onPointerLeave: clearCursor,
    },
    draft,
  };
}
