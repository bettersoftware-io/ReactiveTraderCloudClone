import {
  type Accessor,
  createComputed,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

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
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly onPointerLeave: () => void;
}

/** Event handlers to spread onto the plot wrapper div. */
interface ChartPlotProps {
  readonly onPointerDown: (e: PointerEvent) => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly onPointerUp: (e: PointerEvent) => void;
  readonly onPointerCancel: (e: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly onDblClick: () => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
}

/** A plot position as fractions (0-1) of the plot box — the coordinate
 * currency the draw gesture slots speak, so this primitive stays free of any
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

/** The drawing-tool gesture inputs — a slot object, so this primitive stays
 * machine-agnostic (it never imports `@rtc/client-core`'s drawings machine,
 * only its `EqDrawTool` union). Optional on the primitive: every existing
 * call site that doesn't draw keeps compiling untouched.
 *
 * SOLID PORT NOTE: `tool` is an `Accessor`, not a plain value like the React
 * original's — `createChartGestures`'s setup runs exactly ONCE per mount
 * (no per-render re-invocation to hand it a fresh value), so a plain field
 * captured at that one call would freeze at whatever tool was active on
 * mount and never see a later switch. Every read below calls `draw.tool()`
 * fresh, at the moment of the gesture, same as the `draft` signal. */
export interface DrawGestureSlots {
  readonly tool: Accessor<EqDrawTool>;
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
  readonly viewport: Accessor<ChartViewport>;
  readonly cursor: Accessor<ChartCursor | null>;
  readonly atLiveEdge: Accessor<boolean>;
  readonly plotProps: ChartPlotProps;
  /** Attach via `ref={g.plotRef}` on the plot wrapper — the wheel listener
   *  attaches here. */
  readonly plotRef: (el: HTMLDivElement) => void;
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
  readonly draft: Accessor<DrawDraft | null>;
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

/** The series-growth `createComputed`'s seeded accumulator: the previous
 * length and first-candle-time, compared fresh against the accessors on
 * every run to fork on the growth DIRECTION (append vs. backfill prepend). */
interface SeriesGrowthSnapshot {
  readonly len: number;
  readonly firstTime: number | undefined;
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
  firstCandleTime?: Accessor<number | undefined>,
  draw?: DrawGestureSlots,
): ChartGestures {
  const [viewport, setViewport] = createSignal<ChartViewport>(
    defaultViewport(seriesLen(), defaultVisible()),
  );
  const [cursor, setCursor] = createSignal<ChartCursor | null>(null);
  const [draft, setDraft] = createSignal<DrawDraft | null>(null);
  let plotEl: HTMLDivElement | undefined;
  let dragOrigin: DragOrigin | null = null;
  let pendingViewportWrite: (() => void) | null = null;
  let viewportWriteFrame: number | null = null;

  // Continuous (per-pointermove) viewport writes ride a leading-edge +
  // trailing-frame throttle: latest-wins coalescing that engages exactly
  // when the machine falls behind. On fast hardware frames outpace events,
  // every write is a leading edge, and this is a no-op; on slow hardware
  // (the GPU-less Citrix/VDI case) frames stretch, multiple moves land per
  // frame window, and stale intermediate updates are dropped — the adaptive
  // load-shedding React's ContinuousEventPriority scheduler does built-in,
  // measured at 3.45x drag cost without it under 8x CPU throttle
  // (docs/react-vs-solid-performance.md).
  function writeViewportThrottled(write: () => void): void {
    if (viewportWriteFrame !== null) {
      pendingViewportWrite = write;
      return;
    }

    write();
    viewportWriteFrame = requestAnimationFrame(() => {
      viewportWriteFrame = null;

      const pending = pendingViewportWrite;

      pendingViewportWrite = null;

      if (pending) {
        writeViewportThrottled(pending);
      }
    });
  }

  // Discrete writes (wheel notch, keys, reset) call this first so a pending
  // coalesced drag write cannot land a frame later and overwrite them.
  function dropPendingViewportWrite(): void {
    if (viewportWriteFrame !== null) {
      cancelAnimationFrame(viewportWriteFrame);
      viewportWriteFrame = null;
    }

    pendingViewportWrite = null;
  }

  onCleanup(dropPendingViewportWrite);

  // New candles arriving (seriesLen grows tick-by-tick) fold in via a
  // createComputed watching the live length directly: a live-edge viewport
  // slides with the new bars; a panned-away one holds still so the user's
  // view doesn't jump. Seeded with the CURRENT seriesLen()/firstCandleTime()
  // so the first run (prev.len === len) is a no-op, matching the initial
  // state above.
  createComputed(
    (prev: SeriesGrowthSnapshot) => {
      const len = seriesLen();
      const firstTime = firstCandleTime?.();

      if (len !== prev.len || firstTime !== prev.firstTime) {
        setViewport((vp) => {
          // prev.len === 0 is the solid-bindings placeholder before the
          // candle presenter's real emission lands — not a genuine one-tick
          // delta. Treating it as one via `followLive` slides the degenerate
          // {0,0} initial viewport by the FULL new length, landing on a
          // zero-width window exactly at the series end: `resolveWindow`
          // then renders nothing (empty candles/labels/NaN prices) and
          // `isAtLiveEdge` reads permanently true, so the plot can never pan
          // away from "live" at all. Snap straight to the real default
          // window instead — this is the very first time real data exists,
          // so there is no panned-away position to preserve yet.
          if (prev.len === 0) {
            return defaultViewport(len, defaultVisible());
          }

          // Growth DIRECTION fork: the series growing while its first
          // candle got OLDER is a backfill prepend — every index shifted,
          // so the viewport translates with them (holds a panned-away view
          // still AND keeps an at-edge view at the edge, one code path).
          // Anything else is the live append fold, unchanged.
          const grewBy = len - prev.len;
          const prepended =
            grewBy > 0 &&
            prev.firstTime !== undefined &&
            firstTime !== undefined &&
            firstTime < prev.firstTime;

          if (prepended) {
            // C1: a prepend landing MID-DRAG must also shift the drag's
            // cached origin, or the next pointermove's
            // panBy(dragOrigin.startViewport, ...) recomputes from a
            // viewport that no longer matches reality — snapping the view
            // back by `grewBy` candles and re-triggering the near-edge
            // fetch on every subsequent move, draining the whole depth cap
            // in one continuous drag. `dragOrigin` is a plain `let`, so
            // reassigning it here (inside this createComputed, which already
            // runs synchronously before dependents observe the new
            // viewport) is the direct analogue of the React shell's
            // render-time ref write.
            if (dragOrigin) {
              dragOrigin = {
                ...dragOrigin,
                startViewport: shiftForPrepend(
                  dragOrigin.startViewport,
                  grewBy,
                ),
              };
            }

            return shiftForPrepend(vp, grewBy);
          }

          return followLive(vp, prev.len, len);
        });
      }

      return { len, firstTime };
    },
    { len: seriesLen(), firstTime: firstCandleTime?.() },
  );

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
      dropPendingViewportWrite();
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
    // A pointerdown that lands on an interactive descendant (currently: the
    // BACK TO LIVE pill) must let ITS click through untouched.
    // `setPointerCapture` below retargets every subsequent pointer event
    // for this pointer — including the resulting click — to the plot
    // wrapper regardless of where inside it the pointer actually is, which
    // silently swallows that button's click in a real browser. jsdom's
    // synthetic pointer events don't model capture retargeting, so this
    // was invisible to every component test — exactly the real-browser-
    // only lifecycle an e2e smoke exists to witness.
    if ((e.target as HTMLElement | null)?.closest("button")) {
      return;
    }

    // hline needs only the one point it just landed on — no capture, no
    // drag/draft phase, no pan bookkeeping at all.
    if (draw?.tool() === "hline") {
      draw.onCommitLevel(plotFracOf(e));
      return;
    }

    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();

    dragOrigin = {
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport: viewport(),
      downClient: { x: e.clientX, y: e.clientY },
    };
    target.setPointerCapture(e.pointerId);

    if (draw?.tool() === "trendline") {
      const anchor = plotFracOf(e);
      setDraft({ a: anchor, b: anchor });
    }
  }

  function dragOrTrackCursor(e: PointerEvent): void {
    const drag = dragOrigin;

    if (drag && drag.pointerId === e.pointerId) {
      // The trendline draft's second anchor tracks every move — the
      // crosshair keeps tracking alongside it (the aiming aid stays live
      // while placing a line), unlike a plain pan drag below, which leaves
      // the crosshair frozen at its pre-drag position as it always has.
      if (draft()) {
        const anchor = plotFracOf(e);
        setDraft((d) => {
          return d ? { ...d, b: anchor } : d;
        });
        setCursor({ ...anchor, inPlot: true });
        return;
      }

      const span = drag.startViewport.end - drag.startViewport.start;
      const dxPx = e.clientX - drag.startX;
      const next = panBy(
        drag.startViewport,
        -(dxPx / drag.rectWidth) * span,
        seriesLen(),
      );

      writeViewportThrottled(() => {
        setViewport(next);
      });
      return;
    }

    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
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
  function plotFracOf(e: PointerEvent): PlotFrac {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
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
  function trackPaneCursor(e: PointerEvent): void {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    setCursor({
      xFrac: (e.clientX - rect.left) / rect.width,
      yFrac: 0.5,
      inPlot: false,
    });
  }

  function endDrag(e: PointerEvent): void {
    const drag = dragOrigin;

    if (drag?.pointerId !== e.pointerId) {
      return;
    }

    dragOrigin = null;

    const target = e.currentTarget as HTMLDivElement;

    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }

    const excursionPx = Math.hypot(
      e.clientX - drag.downClient.x,
      e.clientY - drag.downClient.y,
    );

    const openDraft = draft();

    if (openDraft) {
      // Beyond the click threshold: a deliberate line. Within it: a stray
      // click drew nothing — discard either way, the draft is done.
      if (excursionPx > CLICK_MAX_PX) {
        draw?.onCommitLine(openDraft.a, openDraft.b);
      }

      setDraft(null);
      return;
    }

    if (draw?.tool() === "cursor" && excursionPx <= CLICK_MAX_PX) {
      draw.onPlotClick(plotFracOf(e));
    }
  }

  // A pointercancel is an aborted gesture (browser-initiated takeover, e.g.
  // a scroll/refresh gesture on a touchpad), never a completed one — an
  // open trendline draft is discarded here too, never committed, unlike
  // `endDrag`'s click/drag fork above.
  function cancelDrag(e: PointerEvent): void {
    if (dragOrigin?.pointerId !== e.pointerId) {
      return;
    }

    dragOrigin = null;

    const target = e.currentTarget as HTMLDivElement;

    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }

    setDraft(null);
  }

  function clearCursor(): void {
    setCursor(null);
  }

  function resetToLive(): void {
    dropPendingViewportWrite();
    setViewport(defaultViewport(seriesLen(), defaultVisible()));
  }

  function applyViewport(vp: ChartViewport): void {
    // The navigator brush's per-pointermove write path — continuous, so it
    // rides the same frame throttle as the plot drag.
    writeViewportThrottled(() => {
      setViewport(clampViewport(vp, seriesLen()));
    });
  }

  function panOrZoomByKey(e: KeyboardEvent): void {
    dropPendingViewportWrite();

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
      case "Escape":
        // No open draft: nothing to cancel, so no-op (same as any other
        // unhandled key — no preventDefault either).
        if (!draft()) {
          return;
        }

        e.preventDefault();
        // The pointer may still be physically down (the user pressed
        // Escape mid-drag) — clearing dragOrigin here is enough: the
        // eventual real pointerup/pointercancel will see no matching drag
        // and no-op, and the browser releases its own capture on that
        // event as usual.
        dragOrigin = null;
        setDraft(null);
        return;
      case "Delete":
      case "Backspace":
        if (draw?.tool() !== "cursor") {
          return;
        }

        e.preventDefault();
        draw.onDeleteKey();
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
      onPointerCancel: cancelDrag,
      onPointerLeave: clearCursor,
      onDblClick: resetToLive,
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
