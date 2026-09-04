/**
 * The equities watchlist rows (WatchlistRow.tsx). Only the one witness the
 * fullstack real-backend smoke needs — the panel's fuller sort/filter
 * surface is exercised by the ui-contract `WatchlistPanelPage` instead.
 */
export interface EquitiesWatchlistPO {
  /**
   * Wait for the first watchlist row to render AND show a live decimal
   * quote in its LAST column — the row's last column reads "—" until a
   * real market-data tick arrives over the wire, then renders a decimal
   * price (e.g. 142.37).
   */
  waitForFirstRowLiveQuote(timeoutMs: number): Promise<void>;
}
