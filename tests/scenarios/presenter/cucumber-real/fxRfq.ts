// tests/scenarios/presenter/cucumber-real/fxRfq.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

// Notional input is UI state; the simulator's getRfqQuote doesn't gate on notional.
// At presenter level this is recorded but not used for the assertion.
export async function setFirstTileNotional(w: PresenterWorld, _notional: number): Promise<void> {
  // no-op at presenter level
  void w;
}

export async function expectRfqQuoteArrivesWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured (run a 'price tile is visible' step first)");
  // RfqQuotePresenter.requestQuote(symbol, pipsPosition): Observable<RfqQuoteResult>
  const quote = await firstValueFrom(
    w.ctx.app.presenters.rfqQuote.requestQuote(pair.symbol, 4).pipe(timeout(seconds * 1000)),
  );
  w.scratch.rfqQuote = quote;
}
