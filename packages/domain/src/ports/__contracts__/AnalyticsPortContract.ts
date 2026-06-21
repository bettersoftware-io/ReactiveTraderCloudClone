import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { defined } from "../../__testUtils__/defined.js";
import type { AnalyticsPort } from "../analyticsPort.js";

export interface AnalyticsDriver {
  /** Cause the port to emit one PositionUpdates for `currency`. */
  emitAnalytics(currency: string): Promise<void>;
}

export interface AnalyticsHarness {
  port: AnalyticsPort;
  driver: AnalyticsDriver;
  teardown: () => void;
}

export function describeAnalyticsPortContract(
  label: string,
  makeHarness: () => AnalyticsHarness,
): void {
  describe(`${label} :: AnalyticsPort contract`, () => {
    it("emits PositionUpdates with currentPositions[] and history[]", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getAnalytics("USD"));
        await driver.emitAnalytics("USD");
        const update = await promise;
        expect(Array.isArray(update.currentPositions)).toBe(true);
        expect(Array.isArray(update.history)).toBe(true);
      } finally {
        teardown();
      }
    });

    it("history is time-ordered ascending", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getAnalytics("USD"));
        await driver.emitAnalytics("USD");
        const update = await promise;
        if (update.history.length < 2) return;
        for (let i = 1; i < update.history.length; i++) {
          const prev = new Date(
            defined(update.history[i - 1]).timestamp,
          ).getTime();
          const curr = new Date(defined(update.history[i]).timestamp).getTime();
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      } finally {
        teardown();
      }
    });
  });
}
