import { describe, it, expect } from "vitest";
import { MockPricingEngine } from "./pricing-engine.js";

describe("MockPricingEngine", () => {
  it("getPriceHistory returns 50 ticks", async () => {
    const engine = new MockPricingEngine();
    const history = await engine.getPriceHistory("EURUSD");
    expect(history).toHaveLength(50);
  });

  it("each tick has correct structure", async () => {
    const engine = new MockPricingEngine();
    const history = await engine.getPriceHistory("EURUSD");
    const tick = history[0];

    expect(tick.symbol).toBe("EURUSD");
    expect(typeof tick.bid).toBe("number");
    expect(typeof tick.ask).toBe("number");
    expect(typeof tick.mid).toBe("number");
    expect(typeof tick.creationTimestamp).toBe("number");
    expect(typeof tick.valueDate).toBe("string");
  });

  it("ask = mid + 0.0002 and bid = mid - 0.0002", async () => {
    const engine = new MockPricingEngine();
    const history = await engine.getPriceHistory("EURUSD");

    for (const tick of history) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.0002, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.0002, 10);
    }
  });

  it("history ticks are in chronological order", async () => {
    const engine = new MockPricingEngine();
    const history = await engine.getPriceHistory("EURUSD");

    for (let i = 1; i < history.length; i++) {
      expect(history[i].creationTimestamp).toBeGreaterThanOrEqual(history[i - 1].creationTimestamp);
    }
  });

  it("getPriceUpdates yields initial history then new ticks", async () => {
    const engine = new MockPricingEngine();
    const ticks: any[] = [];

    for await (const tick of engine.getPriceUpdates("EURUSD")) {
      ticks.push(tick);
      if (ticks.length >= 52) break; // 50 history + 2 new
    }

    expect(ticks.length).toBeGreaterThanOrEqual(52);
    expect(ticks[0].symbol).toBe("EURUSD");
  });

  it("getRfqQuote widens the spread", () => {
    const engine = new MockPricingEngine();
    const quote = engine.getRfqQuote("EURUSD", 4);

    // priceChange = 0.3 / 10^4 = 0.00003
    const expectedAsk = quote.mid + 0.0002 + 0.00003;
    const expectedBid = quote.mid - 0.0002 - 0.00003;
    expect(quote.ask).toBeCloseTo(expectedAsk, 8);
    expect(quote.bid).toBeCloseTo(expectedBid, 8);
  });

  it("throws for unknown symbol", async () => {
    const engine = new MockPricingEngine();
    await expect(engine.getPriceHistory("INVALID")).rejects.toThrow("Unknown symbol");
  });
});
