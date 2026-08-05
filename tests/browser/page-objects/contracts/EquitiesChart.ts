/** The two indicator panes a chart can show below the plot (IndicatorPane.tsx),
 * toggled independently via IndicatorPills.tsx's pane pills. */
export type EquitiesPaneKind = "rsi" | "macd";

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
  waitYScale(mode: "linear" | "log", timeoutMs: number): Promise<void>;
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
  /** Presses Delete on the focused plot — the `cursor`-tool
   * delete-selected-drawing gesture. */
  pressDelete(): Promise<void>;
  /** Waits for the drawing to be removed from the DOM entirely. */
  waitDrawingGone(timeoutMs: number): Promise<void>;
}
