import { fireEvent, within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type {
  EqChartType,
  EqDrawing,
  EqDrawTool,
  EqIndicatorId,
  EqPaneId,
  EqYScale,
} from "@rtc/client-core";
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
  /** The active RSI/MACD panes, in render order (empty/omitted renders
   * none) — optional so every spec mounting CandleChart before Task 6
   * keeps compiling; the react/solid registry adapters already default a
   * missing value to `[]`. */
  panes?: readonly EqPaneId[];
  /** Price-axis mapping (omitted/undefined = linear) — Task 3/4's LOG pill
   * intent, threaded straight to `chartVm`. */
  yScale?: EqYScale;
  /** Comparison series overlay — presence switches the whole plot to the
   * percent axis (see @rtc/motion-core chartScene). An empty `series` while
   * the compare symbol's data is still loading percent-projects the primary
   * alone (the axis is already %, so the line's arrival doesn't reflow). */
  compare?: { readonly series: readonly Candle[] };
  defaultVisible: number;
  /** Whether an older history page is currently in flight for this series —
   * drives the LOADING OLDER… chip and gates re-triggering. */
  loadingOlder: boolean;
  /** Whether the series has reached the true start of history — combined
   * with the viewport sitting at index 0 to derive the START OF HISTORY
   * chip. */
  historyExhausted: boolean;
  /** Fetches one older history page — the near-edge trigger's intent.
   * Slot: the caller decides what "load older" means for this series. */
  onLoadOlder: () => void;
  /** The active draw tool — defaults to "cursor" (no drawing gesture
   * active) when omitted. Drives `useChartGestures`' pointer-down fork
   * (hline commits immediately, trendline opens a draft, cursor clicks
   * hit-test) — see ChartDrawings.contract.spec.ts (Task 7). */
  drawTool?: EqDrawTool;
  /** The current symbol's committed drawings, in plot order — defaults to
   * none when omitted. */
  drawings?: readonly EqDrawing[];
  /** The id of the currently-selected drawing, or null/omitted for none —
   * drives which item's handles `drawingScene` projects. */
  selectedDrawingId?: string | null;
  /** Commits a finished drawing gesture (trendline drag past the click
   * threshold, or an hline pointer-down). Slot: default no-op. */
  onCommitDrawing?: (drawing: EqDrawing) => void;
  /** Selects (or clears, on null) a drawing by id. Slot: default no-op. */
  onSelectDrawing?: (id: string | null) => void;
  /** Deletes the currently-selected drawing. Slot: default no-op. */
  onDeleteSelected?: () => void;
  /** Shifts every trendline anchor index by `by` (a live prepend keeping
   * drawings pinned to their candles). Slot: default no-op. */
  onShiftAnchors?: (by: number) => void;
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
 * fractions land on a concrete client-coordinate rectangle. Exported so
 * ChartPanelPage's own plot driver (the drawings contract's symbol-isolation
 * case, which draws through ChartPanel's real CandleChart rather than a
 * standalone mount) can stub the SAME rect on its own `chart-plot` element. */
export const STUB_RECT: DOMRect = {
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

  /** Each grid line's projected `--gtop` custom property, in DOM order. */
  gridLineTopVars(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-grid-line"]'),
    ).map((el) => {
      return (el as HTMLElement).style.getPropertyValue("--gtop");
    });
  }

  /** Each price label's projected `--ltop` custom property, in DOM order. */
  priceLabelTopVars(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-price-label"]'),
    ).map((el) => {
      return (el as HTMLElement).style.getPropertyValue("--ltop");
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

  /** The "LOADING OLDER…" chip's presence — shown while a history page is
   * in flight for this series. */
  loadingOlderChip(): boolean {
    return (
      this.root.querySelector('[data-testid="chart-loading-older"]') !== null
    );
  }

  /** The "START OF HISTORY" chip's presence — shown once the series is
   * exhausted AND the viewport sits hard against index 0. */
  historyStartChip(): boolean {
    return (
      this.root.querySelector('[data-testid="chart-history-start"]') !== null
    );
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

  /** The crosshair's raw y→price inversion (`vm.price`, formatted to 2dp by
   * crosshairScene) — distinct from {@link crosshairReadout}'s snapped-candle
   * OHLC text. Rides as a `data-price` attribute on the same readout chip
   * (no visible glyph of its own, so it never perturbs a pixel golden); null
   * while no candle is hovered. */
  crosshairPrice(): string | null {
    return (
      this.root
        .querySelector(`[data-testid="${CROSSHAIR_READOUT_TESTID}"]`)
        ?.getAttribute("data-price") ?? null
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

  /** Whether the given RSI/MACD pane is currently rendered below the plot. */
  paneVisible(kind: EqPaneId): boolean {
    return (
      this.root.querySelector(`[data-testid="chart-pane-${kind}"]`) !== null
    );
  }

  /** Every rendered pane's kind, in DOM order — proves activation ORDER
   * (rsi before macd), not just which panes are present. querySelectorAll
   * always returns matches in document order, never the selector list's
   * own order, so listing "rsi, macd" here doesn't bias the result. */
  paneOrder(): EqPaneId[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>(
        '[data-testid="chart-pane-rsi"], [data-testid="chart-pane-macd"]',
      ),
    ).map((el) => {
      return el
        .getAttribute("data-testid")
        ?.replace("chart-pane-", "") as EqPaneId;
    });
  }

  /** The pane's live readout rows, one per `<span>` under its
   * `chart-pane-readout` — RSI's single row, or MACD's MACD/SIG/HIST
   * triple, each already formatted as "LABEL value". `[]` while no
   * crosshair is present (IndicatorPane renders no readout node at all
   * until then). */
  paneReadoutText(kind: EqPaneId): string[] {
    const readout = this.root.querySelector(
      `[data-testid="chart-pane-${kind}"] [data-testid="chart-pane-readout"]`,
    );

    if (!readout) {
      return [];
    }

    return Array.from(readout.querySelectorAll("span")).map((el) => {
      return el.textContent ?? "";
    });
  }

  /** The chart wrap's `data-panes` count. Reads the wrap div via
   * querySelector — `this.root` is the RTL render container, a PARENT of
   * the wrap (same pattern as yScaleAttr; the old direct getAttribute
   * always returned the fallback). */
  panesAttr(): number {
    return Number(
      this.root.querySelector("[data-panes]")?.getAttribute("data-panes") ??
        "0",
    );
  }

  /** The wrap root's `data-yscale` attribute ("linear" | "log") — queried
   * rather than read off `this.root` directly, since `this.root` is the
   * render container (a parent of the actual wrap div), mirroring
   * ChartPanelPage's own `panesAttr()` query style. */
  yScaleAttr(): string {
    return (
      this.root.querySelector("[data-yscale]")?.getAttribute("data-yscale") ??
      ""
    );
  }

  /** Whether the comparison close-line polyline is rendered. */
  compareLineVisible(): boolean {
    return (
      this.root.querySelector('[data-testid="chart-compare-line"]') !== null
    );
  }

  /** A candle body's inline CSS custom property (e.g. "--top") — geometry
   * assertions read the projected var, not layout (jsdom has none). */
  candleBodyVar(i: number, name: string): string {
    const candle = this.root.querySelectorAll("[data-candle]")[i];
    const body = candle?.querySelectorAll("span")[1];
    return body?.style.getPropertyValue(name) ?? "";
  }

  /** Total DOM node count under the render container — counts the mounted
   * tree including child render roots; the node-budget tripwire's raw
   * signal. See ChartPanes.contract.spec.ts for the WHY. */
  wrapNodeCount(): number {
    return this.root.querySelectorAll("*").length;
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

  /** The plot element with jsdom's holes stubbed: a concrete bounding rect
   * plus the pointer-capture trio jsdom doesn't implement — `startDrag`
   * (useChartGestures) calls `setPointerCapture` on every pointerdown that
   * isn't the hline tool's immediate commit (cursor drags AND trendline
   * drafts both go through the general drag-origin path), so any
   * {@link pointerDown}/{@link pointerUp} driven case needs these stubbed,
   * mirroring {@link navigatorStrip}'s identical trio for the navigator
   * strip. */
  private plot(): HTMLElement {
    const el = within(this.root).getByTestId(PLOT_TESTID);

    el.getBoundingClientRect = (): DOMRect => {
      return STUB_RECT;
    };

    el.setPointerCapture = (): void => {};

    el.hasPointerCapture = (): boolean => {
      return false;
    };

    el.releasePointerCapture = (): void => {};

    return el;
  }

  /** Dispatches a pointerdown on the plot at the given fraction of its
   * (stubbed) bounding rect — opens whatever gesture the active draw tool
   * implies (a trendline draft, an immediate hline commit, or a plain pan/
   * click origin for the cursor tool), the same coordinate math
   * {@link setPointer} uses. */
  pointerDown(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerDown(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** Dispatches a pointerup on the plot at the given fraction of its
   * (stubbed) bounding rect — commits or discards whatever gesture
   * {@link pointerDown} (plus any intervening {@link setPointer} moves)
   * opened. */
  pointerUp(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerUp(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** Every rendered chart-drawing element (a committed trendline/hline
   * `<line>`, or the in-progress draft), in DOM order. */
  drawings(): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>('[data-testid="chart-drawing"]'),
    );
  }

  /** The i-th rendered drawing's given attribute (e.g. "data-kind", "x1",
   * "data-selected"), or null if there is no such drawing/attribute. */
  drawingAttr(i: number, name: string): string | null {
    return this.drawings()[i]?.getAttribute(name) ?? null;
  }

  /** Count of rendered selection-handle circles across every drawing —
   * `drawingScene` only projects handles for the selected item, so this is
   * 0 with nothing selected, 2 for a selected trendline (its two anchors),
   * or 1 for a selected hline (its midpoint). Named `selectionHandleCount`
   * rather than the shorter `handleCount` — the latter trips
   * `rtc/name-functions-by-effect`'s trigger-prefix check (`/^(on|handle)/`),
   * which treats a bare `handle`-prefixed identifier as an event-handler
   * name; "handle" here is the domain noun (a drawing's selection handle),
   * so the qualifier disambiguates the same way `resizeHandleExists` does in
   * LayoutEnginePage. */
  selectionHandleCount(): number {
    return this.root.querySelectorAll('[data-testid="chart-drawing-handle"]')
      .length;
  }

  /** Dispatches a pointermove on the given pane at an x-fraction of its
   * (stubbed) bounding rect — drives `trackPaneCursor`'s crosshair
   * CONTINUATION path (a pane's own hover extends the shared xFrac cursor
   * with `inPlot: false`, per useChartGestures.ts), the pane counterpart of
   * {@link setPointer}. `yFrac` is irrelevant here: `trackPaneCursor` pins it
   * to 0.5 itself (panes have no meaningful vertical crosshair position). */
  setPanePointer(kind: EqPaneId, xFrac: number): void {
    const pane = this.paneEl(kind);
    const rect = pane.getBoundingClientRect();
    fireEvent.pointerMove(pane, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + rect.height / 2,
    });
    this.setProps({});
  }

  private paneEl(kind: EqPaneId): HTMLElement {
    const el = within(this.root).getByTestId(`chart-pane-${kind}`);

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
