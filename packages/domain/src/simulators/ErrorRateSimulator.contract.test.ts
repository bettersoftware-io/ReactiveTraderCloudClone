import { afterEach, beforeEach, vi } from "vitest";

import { describeTelemetryPortContract } from "../ports/__contracts__/TelemetryPortContract.js";
import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import { LatencySimulator } from "./LatencySimulator.js";
import { TelemetrySimulator } from "./TelemetrySimulator.js";
import { ThroughputSimulator } from "./ThroughputSimulator.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describeTelemetryPortContract(
  "TelemetrySimulator(via-ErrorRateSimulator)",
  () => {
    const port = new TelemetrySimulator(
      new ThroughputSimulator(),
      new LatencySimulator(1),
      new ErrorRateSimulator(2),
    );
    return {
      port,
      advance: async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
      teardown: () => {},
    };
  },
);
