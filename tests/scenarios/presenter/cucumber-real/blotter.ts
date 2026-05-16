// tests/scenarios/presenter/cucumber-real/blotter.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectBlotterVisible(w: PresenterWorld): Promise<void> {
  // At presenter level, blotter is "visible" if trades$ emits (the observable exists).
  // We just assert the observable resolves without error.
  await firstValueFrom(
    w.ctx.app.presenters.blotter.trades$.pipe(timeout(3000)),
  );
}

export async function expectBlotterHasAtLeastNRows(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  const trades = await firstValueFrom(
    w.ctx.app.presenters.blotter.trades$.pipe(timeout(3000)),
  );
  if (trades.length < n) {
    throw new Error(
      `blotter has ${trades.length} rows, expected at least ${n}`,
    );
  }
}
