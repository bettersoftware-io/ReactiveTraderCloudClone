import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";

import {
  type ChartViewport,
  centerViewportAt,
  panBy,
  resizeViewportEdge,
  shiftForPrepend,
  type ViewportEdge,
} from "@rtc/motion-core";

/** The hit-test attribute the strip's handle divs carry ("start" | "end"). */
const NAV_EDGE_SELECTOR = "[data-nav-edge]";
const NAV_WINDOW_SELECTOR = "[data-nav-body]";

type BrushMode = ViewportEdge | "move";

/** Event handlers to spread onto the navigator strip div. */
export interface NavigatorStripProps {
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface NavigatorBrush {
  readonly stripProps: NavigatorStripProps;
}

/** The brush drag's bookkeeping cached at pointerdown: mode (window-body
 * move vs. a single-edge resize) and the viewport the drag started from, so
 * every move recomputes from that fixed origin (the plot drag's DragOrigin
 * pattern — never accumulate onto a moving viewport). */
interface BrushOrigin {
  readonly mode: BrushMode;
  readonly pointerId: number;
  readonly startX: number;
  readonly rectWidth: number;
  readonly startViewport: ChartViewport;
}

/**
 * The navigator strip's brush shell (ADR-005, spec §3.2): translates strip
 * pointer gestures into the pure @rtc/motion-core viewport ops and writes
 * the result back through `applyViewport` — the SECOND writer to
 * useChartGestures' one viewport cell. Deliberately zero effects and zero
 * state cells: synthetic pointer handlers + pointer capture + this one
 * drag-origin ref are the whole surface.
 */
export function useNavigatorBrush(
  viewport: ChartViewport,
  applyViewport: (vp: ChartViewport) => void,
  seriesLen: number,
  firstCandleTime?: number,
): NavigatorBrush {
  const originRef = useRef<BrushOrigin | null>(null);

  // C1 (mirrors useChartGestures' own render-adjust bookkeeping): a
  // backfill prepend growing the series mid-drag must shift the CACHED
  // brush origin by the same amount, or the next pointermove's
  // panBy/resizeViewportEdge(origin.startViewport, ...) recomputes from a
  // viewport that no longer matches reality. `firstCandleTime` is OPTIONAL
  // and defaults to undefined on every render for an existing 3-arg
  // caller, so `seriesLen !== prevLen` alone can still flip true (a plain
  // append) without ever satisfying the `prepended` check below — the
  // no-firstCandleTime path collapses to exactly today's behaviour. The
  // ref write happens INSIDE the `setPrevFirstTime` updater callback, not
  // as a bare statement in the render body — same "adjust state during
  // render" seam useChartGestures' own ref write rides (there, nested in
  // its `setViewport` updater); react-hooks/refs' static analysis only
  // recognises a ref access as render-safe when it's inside a state
  // updater function, not a plain conditional in the render body.
  const [prevLen, setPrevLen] = useState(seriesLen);
  const [prevFirstTime, setPrevFirstTime] = useState(firstCandleTime);

  if (seriesLen !== prevLen || firstCandleTime !== prevFirstTime) {
    setPrevLen(seriesLen);
    setPrevFirstTime((prevStoredFirstTime) => {
      const grewBy = seriesLen - prevLen;
      const prepended =
        grewBy > 0 &&
        prevStoredFirstTime !== undefined &&
        firstCandleTime !== undefined &&
        firstCandleTime < prevStoredFirstTime;

      if (prepended && originRef.current) {
        originRef.current = {
          ...originRef.current,
          startViewport: shiftForPrepend(
            originRef.current.startViewport,
            grewBy,
          ),
        };
      }

      return firstCandleTime;
    });
  }

  function startBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const target = e.target as HTMLElement | null;
    const edge = target
      ?.closest(NAV_EDGE_SELECTOR)
      ?.getAttribute("data-nav-edge");

    let mode: BrushMode;
    let startViewport = viewport;

    if (edge === "start" || edge === "end") {
      mode = edge;
    } else if (target?.closest(NAV_WINDOW_SELECTOR)) {
      mode = "move";
    } else {
      // Track hit: recentre the window on the clicked index immediately,
      // then let the same gesture continue as a body drag from there.
      const clickFrac = (e.clientX - rect.left) / rect.width;
      startViewport = centerViewportAt(
        clickFrac * seriesLen,
        viewport,
        seriesLen,
      );
      applyViewport(startViewport);
      mode = "move";
    }

    originRef.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function dragBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    const origin = originRef.current;

    if (!origin || origin.pointerId !== e.pointerId) {
      return;
    }

    // The window follows the pointer: +dx drags the window (and so the
    // viewport) toward the series end — the OPPOSITE sign to the plot drag,
    // where +dx pulls earlier candles into view.
    const dCandles =
      ((e.clientX - origin.startX) / origin.rectWidth) * seriesLen;

    if (origin.mode === "move") {
      applyViewport(panBy(origin.startViewport, dCandles, seriesLen));
      return;
    }

    applyViewport(
      resizeViewportEdge(
        origin.mode,
        origin.startViewport,
        dCandles,
        seriesLen,
      ),
    );
  }

  function endBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    if (originRef.current?.pointerId !== e.pointerId) {
      return;
    }

    originRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return {
    stripProps: {
      onPointerDown: startBrush,
      onPointerMove: dragBrush,
      onPointerUp: endBrush,
      // A pointercancel never fires pointerup — without this, the next hover
      // (same stable pointerId for a mouse) would resume a phantom drag.
      onPointerCancel: endBrush,
    },
  };
}
