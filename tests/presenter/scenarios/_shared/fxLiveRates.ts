// tests/presenter/scenarios/_shared/fxLiveRates.ts
import { firstValueFrom } from "rxjs";
import type { PresenterWorld } from "../_world";

export async function expectPriceTileVisibleWithin(
  w: PresenterWorld,
  seconds: number,
): Promise<void> {
  const pairs = await w.awaitFirstWithin(
    w.ctx.app.presenters.currencyPairs.pairs$,
    seconds * 1000,
  );
  if (pairs.length === 0) throw new Error("no currency pairs available");
  const pair = pairs[0];
  if (!pair) throw new Error("no currency pairs available");

  await w.awaitFirstWithin(
    w.ctx.app.presenters.priceStream.price$(pair),
    seconds * 1000,
  );
  w.scratch.firstPair = pair;
}

export async function expectAtLeastNVisibleTilesWithin(
  w: PresenterWorld,
  n: number,
  seconds: number,
): Promise<void> {
  const pairs = await w.awaitFirstWithin(
    w.ctx.app.presenters.currencyPairs.pairs$,
    seconds * 1000,
  );
  if (pairs.length < n)
    throw new Error(`expected >= ${n} currency pairs, got ${pairs.length}`);
}

export async function recordFirstTileText(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
}

export async function expectFirstTileTextNonEmpty(
  w: PresenterWorld,
): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const current = await w.awaitFirstWithin(
    w.ctx.app.presenters.priceStream.price$(pair),
    2000,
  );
  if (!Number.isFinite(current.mid)) {
    throw new Error(
      `first tile mid is not a finite number, got: ${current.mid}`,
    );
  }
}

export async function expectFirstTileTextMatches(
  w: PresenterWorld,
  pattern: RegExp,
): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair),
  );
  const text = price.mid.toFixed(5);
  if (!pattern.test(text))
    throw new Error(`mid "${text}" did not match ${pattern}`);
}
