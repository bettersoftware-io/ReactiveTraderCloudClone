import { afterEach, vi } from "vitest";

import { describeReferenceDataPortContract } from "../ports/__contracts__/ReferenceDataPortContract.js";
import { ReferenceDataSimulator } from "./ReferenceDataSimulator.js";

afterEach(() => {
  vi.useRealTimers();
});

describeReferenceDataPortContract("ReferenceDataSimulator", () => {
  vi.useFakeTimers();
  const port = new ReferenceDataSimulator();
  return {
    port,
    driver: {
      snapshotPairs: async () => {
        // Simulator self-emits after a 1s initial delay; advance fake time.
        await vi.advanceTimersByTimeAsync(1_000);
      },
    },
    teardown: () => {
      vi.useRealTimers();
    },
  };
});
