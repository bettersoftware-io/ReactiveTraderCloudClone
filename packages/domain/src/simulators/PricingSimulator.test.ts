import { firstValueFrom, lastValueFrom, type Subscription } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
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

  it("ask/bid = mid ± half the pair's typical spread in pip units", async () => {
    const engine = new PricingSimulator();

    // EURUSD: pipsPosition 4 → pip unit 0.0001; spread 1.4 pips → half 0.00007
    const eur = await firstValueFrom(engine.getPriceHistory("EURUSD"));

    for (const tick of eur) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.00007, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.00007, 10);
    }

    // USDJPY: pipsPosition 2 → pip unit 0.01; spread 1.6 pips → half 0.008
    const jpy = await firstValueFrom(engine.getPriceHistory("USDJPY"));

    for (const tick of jpy) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.008, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.008, 10);
    }
  });

  it("initial mids stay within history-walk range of the PROTO base mid", async () => {
    const engine = new PricingSimulator();

    for (const pair of KNOWN_CURRENCY_PAIRS) {
      const history = await firstValueFrom(engine.getPriceHistory(pair.symbol));
      const stepSize = pair.pipsPosition === 2 ? 0.02 : 0.00018;
      // 50 history steps of at most stepSize/2 each from baseMid, plus up to
      // half an ulp of toFixed rounding per step — bound with full stepSize.
      const maxDrift = PRICE_HISTORY_SIZE * stepSize;

      for (const tick of history) {
        expect(
          Math.abs(tick.mid - pair.baseMid),
          pair.symbol,
        ).toBeLessThanOrEqual(maxDrift + 1e-9);
      }
    }
  });

  it("live mids respect the pair's rate precision", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const ticksPromise = lastValueFrom(
      engine
        .getPriceUpdates("USDJPY")
        .pipe(take(PRICE_HISTORY_SIZE + 3), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 5);
    const ticks = await ticksPromise;

    for (const tick of ticks.slice(PRICE_HISTORY_SIZE)) {
      expect(Number(tick.mid.toFixed(3))).toBe(tick.mid);
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
    // Advance past the maximum possible delay (999ms ceiling).
    await vi.advanceTimersByTimeAsync(1000);
    const quote = await promise;

    // priceChange = 0.3 / 10^4 = 0.00003; EURUSD half-spread = 0.00007
    const expectedAsk = quote.mid + 0.00007 + 0.00003;
    const expectedBid = quote.mid - 0.00007 - 0.00003;
    expect(quote.ask).toBeCloseTo(expectedAsk, 8);
    expect(quote.bid).toBeCloseTo(expectedBid, 8);
  });

  it("emits the RFQ quote after a 500–999 ms delay", async () => {
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
      // Past the 999ms ceiling — must have emitted exactly once by now.
      await vi.advanceTimersByTimeAsync(500);
      expect(received).toBeDefined();
      expect(defined(received).bid).toBeLessThan(defined(received).ask);
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

  it("history never grows beyond PRICE_HISTORY_SIZE after a single live tick", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    // Subscribe and wait for exactly one live tick beyond the initial history batch.
    // After the first live tick the internal history array is pushed to 51 items and
    // immediately shifted back to 50 — the `if (> PRICE_HISTORY_SIZE) shift()` branch.
    const liveTicks = lastValueFrom(
      engine.getPriceUpdates("EURUSD").pipe(
        take(PRICE_HISTORY_SIZE + 1), // 50 history + 1 live
        toArray(),
      ),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 2);
    await liveTicks;
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    // The shift() path must have fired: length must still equal the cap, not 51.
    expect(history).toHaveLength(PRICE_HISTORY_SIZE);
    expect(history.length).not.toBeGreaterThan(PRICE_HISTORY_SIZE);
  });
});
