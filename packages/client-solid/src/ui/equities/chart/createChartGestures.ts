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

/** The hovered plot position, as fractions (0-1) of the plot box. */
interface ChartCursor {
  readonly xFrac: number;
  readonly yFrac: number;
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
): ChartGestures {
  const [viewport, setViewport] = createSignal<ChartViewport>(
    defaultViewport(seriesLen(), defaultVisible()),
  );
  const [cursor, setCursor] = createSignal<ChartCursor | null>(null);
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
    applyViewport,
  };
}
