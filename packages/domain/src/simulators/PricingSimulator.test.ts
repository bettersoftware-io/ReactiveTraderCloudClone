import { firstValueFrom, lastValueFrom, type Subscription } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";
import type { RfqQuoteResult } from "../ports/pricingPort.js";
import { PricingSimulator } from "./PricingSimulator.js";

const MAX_TICK_INTERVAL_MS = 1_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("PricingSimulator", () => {
  it("getPriceHistory returns 50 ticks", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    expect(history).toHaveLength(50);
  });

  it("each tick has correct structure", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    const tick = history[0];

    expect(tick.symbol).toBe("EURUSD");
    expect(typeof tick.bid).toBe("number");
    expect(typeof tick.ask).toBe("number");
    expect(typeof tick.mid).toBe("number");
    expect(typeof tick.creationTimestamp).toBe("number");
    expect(typeof tick.valueDate).toBe("string");
  });

  it("ask = mid + 0.0002 and bid = mid - 0.0002", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));

    for (const tick of history) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.0002, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.0002, 10);
    }
  });

  it("history ticks are in chronological order", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));

    for (let i = 1; i < history.length; i++) {
      expect(history[i].creationTimestamp).toBeGreaterThanOrEqual(
        history[i - 1].creationTimestamp,
      );
    }
  });

  it("getPriceUpdates yields initial history then new ticks", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const promise = lastValueFrom(
      engine
        .getPriceUpdates("EURUSD")
        .pipe(take(PRICE_HISTORY_SIZE + 2), toArray()),
    );
    // Drive the live tick scheduler — random interval is bounded by MAX_TICK_INTERVAL_MS.
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 4);
    const ticks = await promise;
    expect(ticks.length).toBeGreaterThanOrEqual(PRICE_HISTORY_SIZE + 2);
    expect(ticks[0].symbol).toBe("EURUSD");
  });

  it("getRfqQuote widens the spread", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const promise = firstValueFrom(engine.getRfqQuote("EURUSD", 4));
    // Advance past the maximum possible delay (2000ms ceiling).
    await vi.advanceTimersByTimeAsync(2000);
    const quote = await promise;

    // priceChange = 0.3 / 10^4 = 0.00003
    const expectedAsk = quote.mid + 0.0002 + 0.00003;
    const expectedBid = quote.mid - 0.0002 - 0.00003;
    expect(quote.ask).toBeCloseTo(expectedAsk, 8);
    expect(quote.bid).toBeCloseTo(expectedBid, 8);
  });

  it("emits the RFQ quote after a 500–2000 ms delay", async () => {
    vi.useFakeTimers();
    try {
      const sim = new PricingSimulator();
      const symbol = "EURUSD";
      let received: RfqQuoteResult | undefined;
      const sub: Subscription = sim.getRfqQuote(symbol, 4).subscribe((q) => {
        received = q;
      });
      // Below the 500ms floor — must not have emitted yet.
      await vi.advanceTimersByTimeAsync(499);
      expect(received).toBeUndefined();
      // Past the 2000ms ceiling — must have emitted exactly once by now.
      await vi.advanceTimersByTimeAsync(1501);
      expect(received).toBeDefined();
      expect(received!.bid).toBeLessThan(received!.ask);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getPriceHistory("INVALID")),
    ).rejects.toThrow("Unknown symbol");
  });

  it("getPriceUpdates throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getPriceUpdates("INVALID")),
    ).rejects.toThrow("Unknown symbol");
  });

  it("getRfqQuote throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getRfqQuote("INVALID", 4)),
    ).rejects.toThrow("Unknown symbol");
  });

  it("live ticks keep the price history capped at PRICE_HISTORY_SIZE", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const consumed = lastValueFrom(
      engine
        .getPriceUpdates("EURUSD")
        .pipe(take(PRICE_HISTORY_SIZE + 10), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 12);
    await consumed;
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    expect(history).toHaveLength(PRICE_HISTORY_SIZE);
  });
});
