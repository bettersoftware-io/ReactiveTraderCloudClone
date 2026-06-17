import { describeAdminPortContract } from "../ports/__contracts__/AdminPortContract.js";
import { ThroughputSimulator } from "./ThroughputSimulator.js";

describeAdminPortContract("ThroughputSimulator", () => {
  const port = new ThroughputSimulator();
  return {
    port,
    driver: {
      // Seed the value the synchronous simulator will report on getThroughput().
      primeGet: (value: number) => {
        port.setThroughput(value);
      },
      // The simulator resolves synchronously; flush/ack are no-ops.
      flushGet: async () => {
        await Promise.resolve();
      },
      ackSet: async () => {
        await Promise.resolve();
      },
    },
    teardown: () => {},
  };
});
