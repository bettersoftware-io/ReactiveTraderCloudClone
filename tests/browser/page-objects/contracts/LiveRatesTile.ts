export interface LiveRatesTilePO {
  /** Wait until at least one tile is rendered. */
  waitForFirstTile(timeoutMs: number): Promise<void>;
  /** Number of currently visible tiles. */
  count(): Promise<number>;
  /** innerText of the first tile (used for "prices update over time" check). */
  firstTileText(): Promise<string>;

  /** Click a category filter (e.g. "EUR", "All"). */
  clickFilter(category: string): Promise<void>;

  /** Charts-toggle chip (LiveRatesHead): click it and read its on/off state. */
  clickChartsToggle(): Promise<void>;
  /** Whether the charts-toggle chip is currently active (`data-active="true"`). */
  chartsToggleActive(): Promise<boolean>;
  /** Whether the charts-toggle chip is visible. */
  chartsToggleVisible(): Promise<boolean>;

  /** Whether the first tile shows a buy button. */
  firstTileBuyVisible(): Promise<boolean>;
  /** Whether the first tile shows a sell button. */
  firstTileSellVisible(): Promise<boolean>;
  /** Whether the first tile's sparkline chart is rendered (charts toggle active). */
  firstTileChartVisible(): Promise<boolean>;

  /** Trade execution on the first tile. */
  clickBuyOnFirst(): Promise<void>;
  clickSellOnFirst(): Promise<void>;
  /** Trade execution on a specific pair tile (e.g. "GBPJPY"). */
  clickBuyOnPair(symbol: string): Promise<void>;

  /** Trade confirmation overlay. */
  waitForConfirmation(timeoutMs: number): Promise<void>;
  confirmationContainsAny(
    patterns: readonly RegExp[],
    timeoutMs: number,
  ): Promise<void>;
  dismissConfirmation(): Promise<void>;
  confirmationHidden(timeoutMs: number): Promise<void>;
  /**
   * Wait for the first tile's execution to leave its in-flight EXECUTING…
   * state, dismiss the resulting confirmation, and wait for the overlay to
   * disappear — leaving the tile clickable again.
   *
   * There is deliberately no plain `isConfirmationVisible()` companion: the
   * in-flight overlay carries the SAME testid as the terminal one, so a bare
   * visibility check reads true while nothing is dismissible yet. Every caller
   * that had one was racing.
   */
  dismissConfirmationOnceSettled(timeoutMs: number): Promise<void>;
  /** Same, on a named pair's tile (e.g. "GBPJPY") rather than the first. */
  dismissPairConfirmationOnceSettled(
    symbol: string,
    timeoutMs: number,
  ): Promise<void>;

  /** Notional input on the first tile. */
  fillFirstTileNotional(value: string): Promise<void>;
  isNotionalInputVisible(): Promise<boolean>;

  /**
   * Buy n times on the first tile, waiting for each execution to settle and
   * dismissing its confirmation before the next click. Encapsulated in the PO
   * so the driver-specific wait loop lives with its implementation, not in the
   * scenario body.
   */
  buyNTimesWithDismissals(n: number): Promise<void>;
}
