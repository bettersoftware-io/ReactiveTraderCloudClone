import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { OpsPort } from "../opsPort.js";

export interface OpsDriver {
  /** Seed the value that the next getThroughput() should resolve to. */
  primeGet(value: number): void;
  /** Resolve the pending (or seeded) getThroughput() exchange. */
  flushGet(): Promise<void>;
  /** Resolve the pending (or seeded) setThroughput() exchange. */
  ackSet(): Promise<void>;
}

export interface OpsHarness {
  port: OpsPort;
  driver: OpsDriver;
  teardown: () => void;
}

export function describeOpsPortContract(
  label: string,
  makeHarness: () => OpsHarness,
): void {
  describe(`${label} :: OpsPort contract`, () => {
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
