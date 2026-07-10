// tests/presenter/scenarios/_shared/fxRfq.ts
import type { PresenterWorld } from "../_world";

// Notional input is UI state; the simulator's getRfqQuote doesn't gate on notional.
// At presenter level this is recorded but not used for the assertion.
export async function setFirstTileNotional(
  w: PresenterWorld,
  _notional: number,
): Promise<void> {
  // no-op at presenter level
  void w;
}

// Requests an RFQ quote via the presenter layer and stores the result in scratch.
// This is the presenter-layer analogue of clicking the "Initiate RFQ" button in the browser.
export async function requestRfqQuoteOnFirstTile(
  w: PresenterWorld,
): Promise<void> {
  const pair = w.scratch.firstPair;

  if (!pair) {
    throw new Error(
      "firstPair not captured (run a 'price tile is visible' step first)",
    );
  }

  const quote = await w.awaitFirstWithin(
    w.ctx.app.presenters.rfqQuote.requestQuote(pair.symbol, pair.pipsPosition),
    5_000,
  );
  w.scratch.rfqQuote = quote;
}

// Asserts that an RFQ quote was already obtained (by requestRfqQuoteOnFirstTile).
export async function expectRfqQuoteArrivesWithin(
  w: PresenterWorld,
  _seconds: number,
): Promise<void> {
  const quote = w.scratch.rfqQuote;

  if (!quote) {
    throw new Error(
      "rfqQuote not captured (run 'requests an RFQ quote' step first)",
    );
  }

  if (!quote.mid) {
    throw new Error("RFQ quote arrived but has no mid price");
  }
}
