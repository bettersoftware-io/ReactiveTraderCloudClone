import { afterEach, vi } from "vitest";

import { describeDealerPortContract } from "../ports/__contracts__/DealerPortContract.js";
import { DealerSimulator } from "./DealerSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describeDealerPortContract("DealerSimulator", () => {
  vi.useFakeTimers();
  const port = new DealerSimulator();
  return {
    port,
    /**
     * DealerSimulator is static: it uses `of(DEALERS_CATALOG)` which
     * emits once synchronously and completes.  It has no addDealer() API
     * and advancing time produces no additional emissions, so the live-add
     * invariant is gated out.
     */
    supportsLiveAdd: false,
    driver: {
      emitInitialSoW: async () => {
        // of() is synchronous; flush microtasks so the Observable machinery
        // delivers the value to firstValueFrom.
        await vi.advanceTimersByTimeAsync(0);
      },
      addDealerAfterSoW: async () => {
        // No-op: supportsLiveAdd is false, this path is never called by the
        // contract describer.
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
