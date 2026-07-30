import { fireEvent, within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";

/** Props CandleChart reads (Task C2/C3's interactive-plot contract: the
 * component owns the gesture hook itself, so it takes the raw series + live
 * overlay + chart-type + active indicators + the timeframe's default visible
 * window, not a precomputed `ChartVm`). */
export interface CandleChartProps {
  candles: readonly Candle[];
  liveRate: number;
  flashOn: boolean;
  kind: EqChartType;
  indicators: readonly EqIndicatorId[];
  defaultVisible: number;
}

/** The BACK TO LIVE pill's presence + a click helper. */
export interface BackToLive {
  readonly visible: boolean;
  click(): void;
}

/** The navigator strip's WAI-ARIA contract — see {@link CandleChartPage.navigatorA11y}. */
export interface NavigatorA11y {
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly hasTabIndex: boolean;
}

const PLOT_TESTID = "chart-plot";
const BACK_TO_LIVE_TESTID = "chart-back-to-live";
const CROSSHAIR_READOUT_TESTID = "chart-crosshair-readout";
const NAVIGATOR_TESTID = "chart-navigator";
const NAVIGATOR_WINDOW_TESTID = "navigator-window";

/** Stand-in plot geometry for jsdom, whose getBoundingClientRect() is
 * all-zeros absent real layout — same 500×50-at-the-origin rect
 * `useChartGestures.test.ts`' own `stubPlotRect` stubs, so xFrac/yFrac
 * fractions land on a concrete client-coordinate rectangle. */
const STUB_RECT: DOMRect = {
  left: 0,
  top: 0,
  width: 500,
  height: 50,
  right: 500,
  bottom: 50,
  x: 0,
  y: 0,
  toJSON: (): unknown => {
    return {};
  },
} as DOMRect;

/** 500×32-at-the-origin strip rect — same jsdom stand-in idea as STUB_RECT. */
const STRIP_RECT: DOMRect = {
  left: 0,
  top: 0,
  width: 500,
  height: 32,
  right: 500,
  bottom: 32,
  x: 0,
  y: 0,
  toJSON: (): unknown => {
    return {};
  },
} as DOMRect;

/**
 * Page object for the CandleChart plot: grid lines, price labels, and
 * per-candle wick/body spans driven entirely by candles/liveRate/flashOn
 * (via @rtc/motion-core's chartVm), plus the gesture-driven viewport (pan/
 * zoom/crosshair/back-to-live) CandleChart now owns directly.
 */
export class CandleChartPage extends MountedComponent<CandleChartProps> {
  gridLineCount(): number {
    return this.root.querySelectorAll('[data-testid="chart-grid-line"]').length;
  }

  priceLabels(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-price-label"]'),
    ).map((el) => {
      return el.textContent ?? "";
    });
  }

  /** Ordered text of every rendered time-axis tick. */
  timeLabels(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-time-label"]'),
    ).map((el) => {
      return el.textContent ?? "";
    });
  }

  candleCount(): number {
    return this.root.querySelectorAll("[data-candle]").length;
  }

  lastCandleUp(): boolean | null {
    const body = this.root.querySelector('[data-last="true"]');
    return body ? body.getAttribute("data-up") === "true" : null;
  }

  lastCandleGlows(): boolean {
    return (
      this.root
        .querySelector('[data-last="true"]')
        ?.getAttribute("data-glow") === "true"
    );
  }

  /** Ordered `data-up` flags for the rendered candle wrappers. */
  candleUps(): boolean[] {
    return Array.from(this.root.querySelectorAll("[data-candle]")).map((el) => {
      return el.getAttribute("data-up") === "true";
    });
  }

  /** Ordered `data-up` flags for the rendered volume bars — cross-checked
   * against {@link candleUps} to prove each bar is coloured by its own
   * candle's direction, not just present one-per-candle. */
  volumeBarUps(): boolean[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-volume-bar"]'),
    ).map((el) => {
      return el.getAttribute("data-up") === "true";
    });
  }

  /** The `data-ind` id of every rendered indicator-overlay polyline, in
   * render order — lets a spec assert which indicators are active
   * independently of how many total `chart-indicator-path` nodes exist. */
  indicatorPathIds(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-indicator-path"]'),
    ).map((el) => {
      return el.getAttribute("data-ind") ?? "";
    });
  }

  /** Focuses the plot and dispatches one keydown — drives the ArrowLeft/
   * ArrowRight pan, +/=/- zoom, and Home/End keyboard contract. */
  pressPlotKey(key: string): void {
    const plot = this.plot();
    plot.focus();
    fireEvent.keyDown(plot, { key });
  }

  /** Counts rendered nodes carrying the given testid, anywhere in the
   * mounted tree (grid lines, price labels, path layers, volume bars, time
   * labels, pills — whatever the caller is checking for). */
  visibleTestids(id: string): number {
    return this.root.querySelectorAll(`[data-testid="${id}"]`).length;
  }

  /** The crosshair readout chip's full text, or null while no candle is
   * hovered (CrosshairOverlay renders nothing without a cursor). */
  crosshairReadout(): string | null {
    return (
      this.root.querySelector(`[data-testid="${CROSSHAIR_READOUT_TESTID}"]`)
        ?.textContent ?? null
    );
  }

  /** The BACK TO LIVE pill's presence + a click helper — shown only once the
   * viewport has panned/zoomed away from the live edge. */
  backToLive(): BackToLive {
    return {
      visible:
        this.root.querySelector(`[data-testid="${BACK_TO_LIVE_TESTID}"]`) !==
        null,
      click: (): void => {
        this.clickTestId(BACK_TO_LIVE_TESTID);
      },
    };
  }

  /** Clicks the first element carrying the given testid. */
  clickTestId(id: string): void {
    fireEvent.click(within(this.root).getByTestId(id));
  }

  /** Dispatches a pointermove on the plot at the given fraction of its
   * (stubbed) bounding rect — drives the crosshair the same way a real
   * hover would. Continuous-priority event (React defers its flush), so a
   * no-op setProps re-flushes the resulting re-render before the caller's
   * next assertion (mirrors BlotterRowPage's hover()/unhover()). */
  setPointer(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerMove(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** Dispatches a pointer-leave off the plot — hides the crosshair. Fires
   * both the bubbling (pointerout) and direct (pointerleave) native events:
   * React synthesises its non-bubbling onPointerLeave from the bubbling
   * pointerout at the root, while Solid binds onPointerLeave to the native
   * event directly — the same dual-fire BlotterRowPage's unhover() uses for
   * mouseout/mouseleave. */
  leavePlot(): void {
    const plot = this.plot();
    fireEvent.pointerOut(plot);
    fireEvent.pointerLeave(plot);
    this.setProps({});
  }

  hasNavigator(): boolean {
    return (
      this.root.querySelector(`[data-testid="${NAVIGATOR_TESTID}"]`) !== null
    );
  }

  /** The navigator strip's WAI-ARIA contract: its `role`/`aria-label`, and
   * whether it carries a `tabindex` (it must not — the strip's own draggable
   * window/handles are the interactive surface, not the group container). */
  navigatorA11y(): NavigatorA11y {
    const el = within(this.root).getByTestId(NAVIGATOR_TESTID);
    return {
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      hasTabIndex: el.hasAttribute("tabindex"),
    };
  }

  /** Drags the shaded window body from one strip-width fraction to another
   * (down on the window, move + up on the strip — the handlers live on the
   * strip and hit-test via the event target). */
  dragNavigatorWindow(fromXFrac: number, toXFrac: number): void {
    const window = within(this.root).getByTestId(NAVIGATOR_WINDOW_TESTID);
    this.brushDrag(window, fromXFrac, toXFrac);
  }

  /** Drags one edge handle between strip-width fractions (a resize/zoom).
   * `fromXFrac` must be the handle's CURRENT fraction (the caller computes
   * it from the viewport it set up) — only the delta `to − from` matters,
   * since hit-testing is by target element, not coordinates. */
  dragNavigatorHandle(
    side: "left" | "right",
    fromXFrac: number,
    toXFrac: number,
  ): void {
    const handle = within(this.root).getByTestId(
      side === "left" ? "navigator-handle-left" : "navigator-handle-right",
    );
    this.brushDrag(handle, fromXFrac, toXFrac);
  }

  /** Presses the empty track at a strip-width fraction (recentres the
   * window) and releases without moving. */
  pressNavigatorTrack(xFrac: number): void {
    const strip = this.navigatorStrip();

    runGestureAndFlushCoalescedFrames(() => {
      fireEvent.pointerDown(strip, {
        pointerId: 1,
        clientX: STRIP_RECT.left + xFrac * STRIP_RECT.width,
        clientY: 16,
      });
      fireEvent.pointerUp(strip, { pointerId: 1 });
    });
    this.setProps({});
  }

  /** down on `target` → move + up on the strip, in strip-width fractions.
   * fromXFrac only anchors the delta (hit-testing is by target, not
   * coordinates). */
  private brushDrag(
    target: HTMLElement,
    fromXFrac: number,
    toXFrac: number,
  ): void {
    const strip = this.navigatorStrip();

    runGestureAndFlushCoalescedFrames(() => {
      fireEvent.pointerDown(target, {
        pointerId: 1,
        clientX: STRIP_RECT.left + fromXFrac * STRIP_RECT.width,
        clientY: 16,
      });
      fireEvent.pointerMove(strip, {
        pointerId: 1,
        clientX: STRIP_RECT.left + toXFrac * STRIP_RECT.width,
        clientY: 16,
      });
      fireEvent.pointerUp(strip, { pointerId: 1 });
    });
    this.setProps({});
  }

  /** The strip element with jsdom's holes stubbed: a concrete bounding rect
   * plus the pointer-capture trio jsdom doesn't implement. */
  private navigatorStrip(): HTMLElement {
    const el = within(this.root).getByTestId(NAVIGATOR_TESTID);

    el.getBoundingClientRect = (): DOMRect => {
      return STRIP_RECT;
    };

    el.setPointerCapture = (): void => {};

    el.hasPointerCapture = (): boolean => {
      return false;
    };

    el.releasePointerCapture = (): void => {};

    return el;
  }

  private plot(): HTMLElement {
    const el = within(this.root).getByTestId(PLOT_TESTID);

    el.getBoundingClientRect = (): DOMRect => {
      return STUB_RECT;
    };

    return el;
  }
}

/**
 * Runs a continuous pointer gesture and synchronously flushes any
 * frame-coalesced viewport writes it scheduled. The Solid client's
 * `createChartGestures` throttles per-pointermove writes to a leading edge +
 * one trailing `requestAnimationFrame` (latest wins); jsdom's rAF is a real
 * 16ms timer a synchronous spec body never yields to, so without this a
 * SECOND drag in the same test would land inside the first drag's still-open
 * frame window and never apply. React schedules no rAF during these gestures
 * (its pointermove batching is scheduler-internal), so capturing frames is a
 * no-op there.
 */
function runGestureAndFlushCoalescedFrames(gesture: () => void): void {
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

  try {
    gesture();

    // A flushed trailing write re-opens the throttle window (one more empty
    // frame), so drain until quiet — this terminates after two rounds.
    while (queue.size > 0) {
      const callbacks = [...queue.values()];

      queue.clear();

      for (const cb of callbacks) {
        cb(performance.now());
      }
    }
  } finally {
    globalThis.requestAnimationFrame = realRequest;
    globalThis.cancelAnimationFrame = realCancel;
  }
}
