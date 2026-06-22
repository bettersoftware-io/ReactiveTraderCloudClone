import { afterEach, vi } from "vitest";

import { describeAnalyticsPortContract } from "../ports/__contracts__/AnalyticsPortContract.js";
import { AnalyticsSimulator } from "./AnalyticsSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describeAnalyticsPortContract("AnalyticsSimulator", () => {
  vi.useFakeTimers();
  const port = new AnalyticsSimulator();
  return {
    port,
    driver: {
      emitAnalytics: async () => {
        // AnalyticsSimulator emits an initial snapshot synchronously via concat(of(initial), updates$);
        // flush microtasks to let the Observable machinery deliver it.
        await vi.advanceTimersByTimeAsync(0);
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
