// tests/scenarios/presenter/cucumber-real/fxLiveRates.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectPriceTileVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const pairs = await firstValueFrom(w.ctx.app.presenters.currencyPairs.pairs$);
  if (pairs.length === 0) throw new Error("no currency pairs available");
  const pair = pairs[0]!;
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair).pipe(timeout(seconds * 1000)),
  );
  w.scratch.firstPair = pair;
  w.scratch.lastPrice = price;
}

export async function expectAtLeastNVisibleTilesWithin(
  w: PresenterWorld, n: number, seconds: number,
): Promise<void> {
  const pairs = await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.pairs$.pipe(timeout(seconds * 1000)),
  );
  if (pairs.length < n) throw new Error(`expected >= ${n} currency pairs, got ${pairs.length}`);
}

export async function recordFirstTileText(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const price = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  w.scratch.lastPrice = price;
}

export async function expectFirstTileTextNonEmpty(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const current = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair).pipe(timeout(2000)),
  );
  if (!Number.isFinite(current.mid)) {
    throw new Error(`first tile mid is not a finite number, got: ${current.mid}`);
  }
}

export async function expectFirstTileTextMatches(w: PresenterWorld, pattern: RegExp): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const price = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  const text = price.mid.toFixed(5);
  if (!pattern.test(text)) throw new Error(`mid "${text}" did not match ${pattern}`);
}
