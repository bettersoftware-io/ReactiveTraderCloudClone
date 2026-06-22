import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PricingPort } from "../pricingPort.js";

export interface PricingDriver {
  tickPrice(symbol: string): Promise<void>;
  ackHistory(symbol: string): Promise<void>;
  ackRfqQuote(symbol: string): Promise<void>;
}

export interface PricingHarness {
  port: PricingPort;
  driver: PricingDriver;
  teardown: () => void;
}

export function describePricingPortContract(
  label: string,
  makeHarness: () => PricingHarness,
): void {
  describe(`${label} :: PricingPort contract`, () => {
    it("getPriceUpdates emits a tick with bid < mid < ask", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getPriceUpdates("EURUSD"));
        await driver.tickPrice("EURUSD");
        const tick = await promise;
        expect(tick.symbol).toBe("EURUSD");
        expect(tick.bid).toBeLessThan(tick.mid);
        expect(tick.mid).toBeLessThan(tick.ask);
      } finally {
        teardown();
      }
    });

    it("getPriceHistory returns an array of ticks then completes", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getPriceHistory("EURUSD"));
        await driver.ackHistory("EURUSD");
        const history = await promise;
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeGreaterThan(0);
        for (const tick of history) {
          expect(tick.symbol).toBe("EURUSD");
        }
      } finally {
        teardown();
      }
    });

    it("getRfqQuote emits one quote with bid < mid < ask then completes", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getRfqQuote("EURUSD", 4));
        await driver.ackRfqQuote("EURUSD");
        const quote = await promise;
        expect(quote.bid).toBeLessThan(quote.mid);
        expect(quote.mid).toBeLessThan(quote.ask);
      } finally {
        teardown();
      }
    });
  });
}
