/** The two indicator panes a chart can show below the plot (IndicatorPane.tsx),
 * toggled independently via IndicatorPills.tsx's pane pills. */
export type EquitiesPaneKind = "rsi" | "macd";

/** The two overlay-line indicators toggled via IndicatorPills.tsx's overlay
 * pills (SvgPathLayer.tsx renders the actual line). */
export type EquitiesIndicatorKind = "sma20" | "ema50";

/** The two draw tools DrawToolPills offers (excludes the momentary
 * `"cursor"` default it always reverts to — see EqDrawingsMachine's
 * `addDrawing` patch). */
export type EquitiesDrawTool = "trendline" | "hline";

/** A drag/click point on the plot, as a fraction (0-1) of its own width and
 * height — the same coordinate currency the app's own gesture hook speaks
 * (`PlotFrac`, useChartGestures.ts). */
export interface PlotFraction {
  readonly x: number;
  readonly y: number;
}

/** The canvas-substrate plot's witness attributes (SceneCanvas's `summary`
 * prop, ChartPlot.tsx) — the only cross-substrate geometry signal, since the
 * canvas painting itself isn't inspectable. */
export interface CanvasPlotSummary {
  readonly candles: number;
  readonly drawings: number;
  readonly compare: boolean;
}

/**
 * The equities interactive candle chart plot (CandleChart) plus its
 * back-to-live lifecycle: panning away from the live edge (ArrowLeft) freezes
 * the visible time window and reveals the BACK TO LIVE pill; clicking it
 * resumes following the live edge. The fuller gesture/pixel surface (zoom,
 * crosshair, indicators…) is exercised by the ui-contract CandleChartPage —
 * this PO covers only what the e2e smoke needs to witness the one lifecycle
 * jsdom can't: real wall-clock ticks continuing to arrive while the plot
 * stays visually frozen, PLUS the one indicator-pane readout journey that
 * needs a REAL pointer move (jsdom can't dispatch one either) — a pane's
 * live RSI/MACD readout only updates from the shared crosshair cursor a
 * genuine pointermove sets (see useChartGestures' dragOrTrackCursor).
 */
export interface EquitiesChartPO {
  waitPlotVisible(timeoutMs: number): Promise<void>;
  focusPlot(): Promise<void>;
  pressArrowLeft(): Promise<void>;
  /** Pans all the way to the series' oldest fetched candle (the left-edge
   * trigger point) — the near-edge-of-history backfill trigger. */
  pressHome(): Promise<void>;
  waitBackToLiveVisible(timeoutMs: number): Promise<void>;
  waitBackToLiveHidden(timeoutMs: number): Promise<void>;
  clickBackToLive(): Promise<void>;
  /** Ordered text of every rendered time-axis tick. */
  timeLabels(): Promise<string[]>;
  /** Text of the FIRST (leftmost/oldest) rendered time-axis tick. */
  oldestTimeLabel(): Promise<string>;
  waitNavigatorVisible(timeoutMs: number): Promise<void>;
  /** Drags the navigator window body by a fraction of the strip's width
   * (negative = toward older candles). */
  dragNavigatorWindowBy(stripWidthFrac: number): Promise<void>;
  /** Drags the right handle to the strip's right edge — re-enters
   * live-follow. */
  dragNavigatorRightHandleToLiveEdge(): Promise<void>;
  /** Clicks the given indicator pane's toggle pill (IndicatorPills.tsx). */
  clickPanePill(kind: EquitiesPaneKind): Promise<void>;
  /** Waits for the given pane's root to render (IndicatorPane.tsx). */
  waitPaneVisible(kind: EquitiesPaneKind, timeoutMs: number): Promise<void>;
  /** Waits for the given SMA20/EMA50 overlay toggle pill
   *  (IndicatorPills.tsx) to report `data-active="true"`. */
  waitIndicatorActive(
    kind: EquitiesIndicatorKind,
    timeoutMs: number,
  ): Promise<void>;
  /** A REAL pointer move to the main plot's center — the gesture the pane
   * readout's live value derives from. */
  hoverPlotCenter(): Promise<void>;
  /** Waits for the given pane's live readout row to render — it appears only
   * once the shared crosshair cursor is active (see the file doc above). */
  waitPaneReadoutVisible(
    kind: EquitiesPaneKind,
    timeoutMs: number,
  ): Promise<void>;
  /** Text of the given pane's live crosshair readout row. */
  paneReadoutText(kind: EquitiesPaneKind): Promise<string>;
  /** Clicks the LOG price-axis pill (IndicatorPills.tsx). */
  clickYScalePill(): Promise<void>;
  /** Waits until the chart wrap's data-yscale equals the given mode. */
  waitYScale(
    mode: "linear" | "log" | "percent",
    timeoutMs: number,
  ): Promise<void>;
  /** Clicks the VS comparison pill for the given symbol (ComparePills.tsx). */
  clickComparePill(sym: string): Promise<void>;
  /** Waits until the comparison close-line polyline is rendered. */
  waitCompareLineVisible(timeoutMs: number): Promise<void>;
  /** Waits until the comparison close-line polyline is gone. */
  waitCompareLineHidden(timeoutMs: number): Promise<void>;
  /** Clicks the given draw-tool pill (DrawToolPills.tsx). */
  clickDrawPill(tool: EquitiesDrawTool): Promise<void>;
  /** A real pointer drag across the plot, from one fractional position to
   * another — down, move (multi-step), up — driving the trendline/hline
   * commit gesture's pointer-capture path jsdom can't dispatch. */
  dragOnPlot(from: PlotFraction, to: PlotFraction): Promise<void>;
  /** Waits for a committed drawing (DrawingsLayer's `chart-drawing`) to
   * render. */
  waitDrawingVisible(timeoutMs: number): Promise<void>;
  /** Clicks the plot at the rendered drawing's own midpoint — the drawing
   * overlay is `pointer-events: none`, so hit-testing is driven by a real
   * click on the plot underneath, at the drawing's coordinates. */
  clickDrawing(): Promise<void>;
  /** Waits for the drawing to render with `data-selected="true"`. */
  waitDrawingSelected(timeoutMs: number): Promise<void>;
  /** The selected drawing's `x1,y1,x2,y2` attribute string — a cheap
   * before/after fingerprint for the drag-edit assertion, not a full
   * geometry read. */
  readDrawingGeometry(): Promise<string>;
  /** Drags the selected drawing's SECOND endpoint handle
   * (`chart-drawing-handle`) by a fixed on-plot vector, gripping and
   * releasing via real pointer events — the same pointer-capture path
   * `dragOnPlot` drives, needed because the handle itself is
   * `pointer-events: none` (see `PlaywrightEquitiesChart.clickDrawing`'s
   * doc for the same trap on the drawing line). */
  dragSelectedDrawingEndpoint(): Promise<void>;
  /** Polls until the drawing's SHAPE (`x2-x1`, `y2-y1`) has moved by more
   * than a few plot-percent from a prior {@link readDrawingGeometry}
   * snapshot (`before`) — the drag-edit gesture commits its update on
   * pointer-up, not per-frame. Deliberately not a bare string/position
   * diff: the drawing is re-projected through the live y-scale on every
   * sim tick and can slide with the visible window, either of which can
   * change an UNDRAGGED drawing's absolute x1/y1/x2/y2 within the poll
   * window — but both move the two endpoints (near-)uniformly, leaving the
   * segment's shape unchanged, so shape is the drag-only witness. */
  expectDrawingGeometryChangedWithin(
    before: string,
    timeoutMs: number,
  ): Promise<void>;
  /** Presses Delete on the focused plot — the `cursor`-tool
   * delete-selected-drawing gesture. */
  pressDelete(): Promise<void>;
  /** Waits for the drawing to be removed from the DOM entirely. */
  waitDrawingGone(timeoutMs: number): Promise<void>;
  /** Waits for the canvas-substrate plot (`chart-canvas-plot`) to render —
   * true only once the Chart renderer preference has flipped to "canvas"
   * and the chart has re-rendered with a canvas scene. */
  waitCanvasPlotVisible(timeoutMs: number): Promise<void>;
  /** Waits for the canvas-substrate plot to be gone — the DOM-mode geometry
   * tree (grid/candles/drawings) renders in its place. */
  waitCanvasPlotHidden(timeoutMs: number): Promise<void>;
  /** Reads the canvas plot's witness attributes — a one-shot snapshot, not a
   * poll (callers needing to wait on a specific count should use
   * {@link waitCanvasDrawingsCount} instead). */
  readCanvasSummary(): Promise<CanvasPlotSummary>;
  /** Waits for the canvas plot's `data-drawings` witness attribute to equal
   * `count` — the canvas-mode analogue of `waitDrawingVisible`/
   * `waitDrawingGone` (DOM mode renders one `chart-drawing` element per
   * drawing; canvas mode renders none, just this attribute). */
  waitCanvasDrawingsCount(count: number, timeoutMs: number): Promise<void>;
  /** Waits for every DOM-mode candle (`[data-candle]`, CandleBars.tsx) to be
   * gone — true in canvas mode, where the canvas draws candles itself with
   * no per-candle DOM. */
  waitDomCandlesHidden(timeoutMs: number): Promise<void>;
  /** Waits for at least one DOM-mode candle to (re)render — true back in DOM
   * mode. A count check, not a visibility check: the `[data-candle]` wrapper
   * itself carries no geometry (its wick/body children are absolutely
   * positioned), so it always reads as zero-size/"hidden" to a visibility
   * assertion even when candles are genuinely on screen. */
  waitDomCandlesVisible(timeoutMs: number): Promise<void>;
  /** A REAL pointer move to a fractional point on the plot (no down/up) —
   * the crosshair-only half of `dragOnPlot`'s pointer path, needed because a
   * genuine pointermove is what activates the shared crosshair cursor
   * (jsdom can't dispatch one — the same trap `hoverPlotCenter` works
   * around). */
  moveCrosshairOnPlot(at: PlotFraction): Promise<void>;
  /** Waits for the crosshair readout chip (CrosshairOverlay.tsx) to render —
   * it renders in BOTH substrates (see the testid's own doc in
   * testids.ts). */
  waitCrosshairReadoutVisible(timeoutMs: number): Promise<void>;
}
