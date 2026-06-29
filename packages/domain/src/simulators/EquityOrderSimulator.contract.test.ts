import { afterEach, vi } from "vitest";

import { describeOrderPortContract } from "../ports/__contracts__/OrderPortContract.js";
import { EquityOrderSimulator } from "./EquityOrderSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describeOrderPortContract("EquityOrderSimulator", () => {
  vi.useFakeTimers();
  const port = new EquityOrderSimulator({ seed: 42 });
  return {
    port,
    driver: {
      // Lifecycle stages (new→working→partiallyFilled→filled) fire via
      // timer() over simulated time. Advancing 2000ms past FILL_MS=1500
      // completes the full lifecycle.
      settlePlacement: async () => {
        await vi.advanceTimersByTimeAsync(2000);
      },
      // orders() emits a snapshot and completes synchronously.
      ackOrders: async () => {
        await Promise.resolve();
      },
      // cancel() returns of(undefined) — completes synchronously.
      ackCancel: async () => {
        await Promise.resolve();
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
