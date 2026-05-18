import { afterEach, vi } from "vitest";
import { describeInstrumentPortContract } from "../ports/__contracts__/InstrumentPortContract.js";
import { InstrumentSimulator } from "./creditReferenceDataSimulator.js";

afterEach(() => vi.useRealTimers());

describeInstrumentPortContract("InstrumentSimulator", () => {
  vi.useFakeTimers();
  const port = new InstrumentSimulator();
  return {
    port,
    /**
     * InstrumentSimulator is static: it uses `of(INSTRUMENTS_CATALOG)` which
     * emits once synchronously and completes.  It has no addInstrument() API
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
      addInstrumentAfterSoW: async () => {
        // No-op: supportsLiveAdd is false, this path is never called by the
        // contract describer.
      },
    },
    teardown: () => vi.useRealTimers(),
  };
});
