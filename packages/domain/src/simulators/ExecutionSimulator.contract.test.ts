import { afterEach, vi } from "vitest";

import { describeExecutionPortContract } from "../ports/__contracts__/ExecutionPortContract.js";
import { ExecutionSimulator } from "./ExecutionSimulator.js";

afterEach(() => vi.useRealTimers());

describeExecutionPortContract("ExecutionSimulator", () => {
  vi.useFakeTimers();
  const port = new ExecutionSimulator();
  return {
    port,
    driver: {
      ackExecute: async () => {
        // NORMAL_MAX_DELAY_MS = 2000ms; DELAYED_PAIR_MS = 4000ms for EURJPY.
        // Default test pair is EURUSD so 2500ms covers it; 5000ms covers any pair.
        await vi.advanceTimersByTimeAsync(5_000);
      },
    },
    teardown: () => vi.useRealTimers(),
  };
});
