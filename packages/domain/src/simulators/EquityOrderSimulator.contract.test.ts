import { afterEach, vi } from "vitest";

import { describeOrderPortContract } from "../ports/__contracts__/OrderPortContract.js";
import { EquityOrderSimulator } from "./EquityOrderSimulator.js";

afterEach(() => {return vi.useRealTimers()});

describeOrderPortContract("EquityOrderSimulator", () => {
  vi.useFakeTimers();
  const port = new EquityOrderSimulator({ seed: 42 });
  return {
    port,
    driver: {
      // Lifecycle stages (new→working→partiallyFilled→filled) fire via
      // queueMicrotask which is NOT faked. Awaiting any Promise drains the
      // microtask queue, completing the lifecycle before this returns.
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
    teardown: () => {return vi.useRealTimers()},
  };
});
