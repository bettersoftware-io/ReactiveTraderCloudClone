import { afterEach, vi } from "vitest";

import { describePricingPortContract } from "../ports/__contracts__/PricingPortContract.js";
import { PricingSimulator } from "./PricingSimulator.js";

afterEach(() => vi.useRealTimers());

describePricingPortContract("PricingSimulator", () => {
  vi.useFakeTimers();
  const port = new PricingSimulator();
  return {
    port,
    driver: {
      tickPrice: async () => {
        // getPriceUpdates emits pre-populated history ticks first (via concat);
        // firstValueFrom resolves from the first historical tick without advancing time.
        await Promise.resolve();
      },
      ackHistory: async () => {
        // getPriceHistory returns of([...history]) — resolves synchronously.
        await Promise.resolve();
      },
      ackRfqQuote: async () => {
        // getRfqQuote delays 500–2000 ms via timer(); advance fake time past the max.
        await vi.advanceTimersByTimeAsync(2_000);
      },
    },
    teardown: () => vi.useRealTimers(),
  };
});
