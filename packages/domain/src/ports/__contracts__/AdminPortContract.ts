import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import type { AdminPort } from "../adminPort.js";

export interface AdminDriver {
  /** Seed the value that the next getThroughput() should resolve to. */
  primeGet(value: number): void;
  /** Resolve the pending (or seeded) getThroughput() exchange. */
  flushGet(): Promise<void>;
  /** Resolve the pending (or seeded) setThroughput() exchange. */
  ackSet(): Promise<void>;
}

export interface AdminHarness {
  port: AdminPort;
  driver: AdminDriver;
  teardown: () => void;
}

export function describeAdminPortContract(
  label: string,
  makeHarness: () => AdminHarness,
): void {
  describe(`${label} :: AdminPort contract`, () => {
    it("getThroughput emits the current value then completes", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        driver.primeGet(250);
        const promise = firstValueFrom(port.getThroughput());
        await driver.flushGet();
        expect(await promise).toBe(250);
      } finally {
        teardown();
      }
    });

    it("setThroughput completes with no value", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.setThroughput(500));
        await driver.ackSet();
        await expect(promise).resolves.toBeUndefined();
      } finally {
        teardown();
      }
    });
  });
}
