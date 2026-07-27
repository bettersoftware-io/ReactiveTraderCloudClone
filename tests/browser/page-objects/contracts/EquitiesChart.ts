/**
 * The equities interactive candle chart plot (CandleChart) plus its
 * back-to-live lifecycle: panning away from the live edge (ArrowLeft) freezes
 * the visible time window and reveals the BACK TO LIVE pill; clicking it
 * resumes following the live edge. The fuller gesture/pixel surface (zoom,
 * crosshair, indicators…) is exercised by the ui-contract CandleChartPage —
 * this PO covers only what the e2e smoke needs to witness the one lifecycle
 * jsdom can't: real wall-clock ticks continuing to arrive while the plot
 * stays visually frozen.
 */
export interface EquitiesChartPO {
  waitPlotVisible(timeoutMs: number): Promise<void>;
  focusPlot(): Promise<void>;
  pressArrowLeft(): Promise<void>;
  waitBackToLiveVisible(timeoutMs: number): Promise<void>;
  waitBackToLiveHidden(timeoutMs: number): Promise<void>;
  clickBackToLive(): Promise<void>;
  /** Ordered text of every rendered time-axis tick. */
  timeLabels(): Promise<string[]>;
  waitNavigatorVisible(timeoutMs: number): Promise<void>;
  /** Drags the navigator window body by a fraction of the strip's width
   * (negative = toward older candles). */
  dragNavigatorWindowBy(stripWidthFrac: number): Promise<void>;
  /** Drags the right handle to the strip's right edge — re-enters
   * live-follow. */
  dragNavigatorRightHandleToLiveEdge(): Promise<void>;
}
