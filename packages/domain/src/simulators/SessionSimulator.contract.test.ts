import { afterEach, beforeEach, vi } from "vitest";

import { describeSessionsPortContract } from "../ports/__contracts__/SessionsPortContract.js";
import { SessionSimulator } from "./SessionSimulator.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describeSessionsPortContract("SessionSimulator", () => {
  const port = new SessionSimulator(5);
  return {
    port,
    advance: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    teardown: () => {},
  };
});
