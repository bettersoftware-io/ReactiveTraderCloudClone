import { firstValueFrom, NEVER, Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityPosition } from "../equities/position.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import { EquityPositionSimulator } from "./EquityPositionSimulator.js";

// The port contract covers the buy-and-hold path. Three behaviours it never
// reaches, each a real bookkeeping rule rather than a defensive guard:
//   - a SELL relieves cost at the running average, not at the sale price
//     (getting this wrong silently fabricates realised P&L on every partial);
//   - marking is subscribed once per symbol, not once per fill;
//   - a flat position leaves the emitted list entirely.

describe("EquityPositionSimulator sell bookkeeping", () => {
  it("relieves cost at the running average, not the sale price", async () => {
    const sim = new EquityPositionSimulator(stubMarketData());

    // Two buys → avg 110 over 200 shares (cost 22_000).
    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 });
    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 100, price: 120 });

    // Sell 50 at 200. Cost must drop by 50 * 110 (the average), NOT 50 * 200 —
    // relieving at the sale price would leave avgPrice wrong for the remainder.
    sim.bookFill({ symbol: "AAPL", side: "sell", qty: 50, price: 200 });

    const position = await onlyPosition(sim);

    expect(position.qty).toBe(150);
    expect(position.avgPrice).toBeCloseTo(110, 10);
  });

  it("treats a sell with no prior lot as opening a short at the sale price", async () => {
    const sim = new EquityPositionSimulator(stubMarketData());

    // qty is 0, so there is no average to relieve against: the code falls back
    // to the fill price, which must leave the short's avgPrice at that price.
    sim.bookFill({ symbol: "TSLA", side: "sell", qty: 10, price: 250 });

    const position = await onlyPosition(sim);

    expect(position.qty).toBe(-10);
    expect(position.avgPrice).toBeCloseTo(250, 10);
  });
});

describe("EquityPositionSimulator marking", () => {
  it("subscribes to a symbol's quotes once however many fills arrive", () => {
    let subscribeCount = 0;
    const sim = new EquityPositionSimulator(
      stubMarketData(() => {
        subscribeCount += 1;
      }),
    );

    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 });
    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 10, price: 101 });
    sim.bookFill({ symbol: "AAPL", side: "sell", qty: 5, price: 102 });

    // One per SYMBOL. Re-subscribing per fill would leak a subscription on
    // every trade and re-mark the same position N times per tick.
    expect(subscribeCount).toBe(1);
  });

  it("subscribes separately per symbol", () => {
    let subscribeCount = 0;
    const sim = new EquityPositionSimulator(
      stubMarketData(() => {
        subscribeCount += 1;
      }),
    );

    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 });
    sim.bookFill({ symbol: "MSFT", side: "buy", qty: 10, price: 400 });

    expect(subscribeCount).toBe(2);
  });

  it("re-marks the position from a live quote", async () => {
    const quotes = new Subject<Tick>();
    const sim = new EquityPositionSimulator(stubMarketData(undefined, quotes));

    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 });
    quotes.next({ last: 130 });

    const position = await onlyPosition(sim);

    expect(position.markPrice).toBe(130);
    expect(position.unrealisedPnl).toBeCloseTo(300, 10);
  });
});

describe("EquityPositionSimulator flat positions", () => {
  it("drops a symbol once it is fully closed", async () => {
    const sim = new EquityPositionSimulator(stubMarketData());

    sim.bookFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 });
    sim.bookFill({ symbol: "MSFT", side: "buy", qty: 5, price: 400 });
    sim.bookFill({ symbol: "AAPL", side: "sell", qty: 10, price: 120 });

    const positions = await firstValueFrom(sim.positions());

    // A qty-0 lot stays in the internal map but must not surface as a row —
    // otherwise the blotter shows a flat line with a divide-by-zero avgPrice.
    expect(
      positions.map((position) => {
        return position.symbol;
      }),
    ).toEqual(["MSFT"]);
  });
});

interface Tick {
  last: number;
}

/** A MarketDataPort whose quote stream is inert unless one is supplied, so a
 * test observes only the fills it drives. `onSubscribe` counts subscriptions. */
function stubMarketData(
  onSubscribe?: () => void,
  quotes?: Subject<Tick>,
): MarketDataPort {
  return {
    quotes: () => {
      return new Observable<Tick>((subscriber) => {
        onSubscribe?.();

        if (!quotes) {
          return NEVER.subscribe(subscriber);
        }

        return quotes.subscribe(subscriber);
      });
    },
  } as unknown as MarketDataPort;
}

async function onlyPosition(
  sim: EquityPositionSimulator,
): Promise<EquityPosition> {
  const positions = await firstValueFrom(sim.positions());
  const position = positions[0];

  if (!position) {
    throw new Error("expected exactly one position");
  }

  return position;
}
