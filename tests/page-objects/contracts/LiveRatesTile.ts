export interface LiveRatesTilePO {
  /** Wait until at least one tile is rendered. */
  waitForFirstTile(timeoutMs: number): Promise<void>;
  /** Number of currently visible tiles. */
  count(): Promise<number>;
  /** innerText of the first tile (used for "prices update over time" check). */
  firstTileText(): Promise<string>;

  /** Click a category filter (e.g. "EUR", "All"). */
  clickFilter(category: string): Promise<void>;

  /** View toggle (chart/price). */
  clickViewToggle(): Promise<void>;
  viewToggleLabel(): Promise<string>;

  /** Whether the first tile shows a buy button. */
  firstTileBuyVisible(): Promise<boolean>;
  /** Whether the first tile shows a sell button. */
  firstTileSellVisible(): Promise<boolean>;
  /** Whether the view-toggle button is visible. */
  viewToggleVisible(): Promise<boolean>;

  /** Trade execution on the first tile. */
  clickBuyOnFirst(): Promise<void>;
  clickSellOnFirst(): Promise<void>;

  /** Trade confirmation overlay. */
  waitForConfirmation(timeoutMs: number): Promise<void>;
  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void>;
  dismissConfirmation(): Promise<void>;
  confirmationHidden(timeoutMs: number): Promise<void>;
  isConfirmationVisible(): Promise<boolean>;

  /** Notional input on the first tile. */
  fillFirstTileNotional(value: string): Promise<void>;
  isNotionalInputVisible(): Promise<boolean>;
}
