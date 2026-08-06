/** The two indicator panes a chart can show below the plot (IndicatorPane.tsx),
 * toggled independently via IndicatorPills.tsx's pane pills. */
export type EquitiesPaneKind = "rsi" | "macd";

/** The two overlay-line indicators toggled via IndicatorPills.tsx's overlay
 * pills (SvgPathLayer.tsx renders the actual line). */
export type EquitiesIndicatorKind = "sma20" | "ema50";

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
  waitYScale(mode: "linear" | "log", timeoutMs: number): Promise<void>;
}
