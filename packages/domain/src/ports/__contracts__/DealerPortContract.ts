import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";
import type { DealerPort } from "../dealerPort.js";

export interface DealerDriver {
  emitInitialSoW(): Promise<void>;
  addDealerAfterSoW(): Promise<void>;
}

export interface DealerHarness {
  port: DealerPort;
  driver: DealerDriver;
  teardown: () => void;
  /**
   * Set to false for static simulators that cannot produce a subsequent
   * emission after the initial SoW. Defaults to true.
   */
  supportsLiveAdd?: boolean;
}

export function describeDealerPortContract(
  label: string,
  makeHarness: () => DealerHarness,
): void {
  describe(`${label} :: DealerPort contract`, () => {
    it("first emission contains the SoW set as a full snapshot", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getDealers());
        await driver.emitInitialSoW();
        const initial = await promise;
        expect(Array.isArray(initial)).toBe(true);
        expect(initial.length).toBeGreaterThan(0);
      } finally {
        teardown();
      }
    });

    it("subsequent emissions are full snapshots, not deltas", async () => {
      const harness = makeHarness();
      const { port, driver, teardown, supportsLiveAdd = true } = harness;
      if (!supportsLiveAdd) {
        teardown();
        return;
      }
      try {
        const promise = firstValueFrom(
          port.getDealers().pipe(take(2), toArray()),
        );
        await driver.emitInitialSoW();
        await driver.addDealerAfterSoW();
        const emissions = await promise;
        expect(emissions).toHaveLength(2);
        expect(emissions[1]!.length).toBeGreaterThan(emissions[0]!.length);
      } finally {
        teardown();
      }
    });
  });
}
