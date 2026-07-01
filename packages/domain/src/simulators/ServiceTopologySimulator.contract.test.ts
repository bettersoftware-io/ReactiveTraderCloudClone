import { afterEach, beforeEach, vi } from "vitest";

import { describeServiceHealthPortContract } from "../ports/__contracts__/ServiceHealthPortContract.js";
import { ServiceTopologySimulator } from "./ServiceTopologySimulator.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describeServiceHealthPortContract("ServiceTopologySimulator", () => {
  const port = new ServiceTopologySimulator(3);
  return {
    port,
    advance: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    teardown: () => {},
  };
});
