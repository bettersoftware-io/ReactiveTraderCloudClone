// tests/presenter/scenarios/_shared/blotter.ts
import type { PresenterWorld } from "../_world";

export async function expectBlotterVisible(w: PresenterWorld): Promise<void> {
  // At presenter level, blotter is "visible" if trades$ emits (the observable exists).
  // We just assert the observable resolves without error.
  await w.awaitFirstWithin(w.ctx.app.presenters.blotter.trades$, 3000);
}

export async function expectBlotterHasAtLeastNRows(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  const trades = await w.awaitFirstWithin(w.ctx.app.presenters.blotter.trades$, 3000);
  if (trades.length < n) {
    throw new Error(`blotter has ${trades.length} rows, expected at least ${n}`);
  }
}
