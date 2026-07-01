import { afterEach, beforeEach, vi } from "vitest";

import { describeEventLogPortContract } from "../ports/__contracts__/EventLogPortContract.js";
import { EventLogSimulator } from "./EventLogSimulator.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describeEventLogPortContract("EventLogSimulator", () => {
  const port = new EventLogSimulator(4);
  return {
    port,
    advance: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    teardown: () => {},
  };
});
