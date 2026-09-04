import type { TestContext } from "../testContext";

/**
 * Wait for the first equities watchlist row to be visible AND show a live
 * decimal quote in its last column — used by the fullstack real-backend
 * smoke to prove the watchlist chain (browser → presenter → WsReal adapter
 * → WebSocket → server watchlist$ effect → EquityMarketDataSimulator)
 * delivered a genuine tick.
 */
export async function expectFirstRowShowsLiveQuoteWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesWatchlist.waitForFirstRowLiveQuote(seconds * 1_000);
}
