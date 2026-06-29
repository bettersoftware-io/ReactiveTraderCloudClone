import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PositionPort } from "../positionPort.js";

export interface PositionDriver {
  /** Resolve a pending positions() emission. */
  ackPositions(): Promise<void>;
}
export interface PositionHarness {
  port: PositionPort;
  driver: PositionDriver;
  teardown: () => void;
}

export function describePositionPortContract(
  label: string,
  makeHarness: () => PositionHarness,
): void {
  describe(`${label} :: PositionPort contract`, () => {
    it("positions emits an array; each unrealisedPnl matches qty*(mark-avg)", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.positions());
        await driver.ackPositions();
        const positions = await promise;
        expect(Array.isArray(positions)).toBe(true);

        for (const p of positions) {
          expect(p.unrealisedPnl).toBeCloseTo(
            p.qty * (p.markPrice - p.avgPrice),
            6,
          );
        }
      } finally {
        teardown();
      }
    });
  });
}
