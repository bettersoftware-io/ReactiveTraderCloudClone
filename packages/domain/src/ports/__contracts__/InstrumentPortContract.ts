import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";
import { defined } from "../../__testUtils__/defined.js";
import type { InstrumentPort } from "../instrumentPort.js";

export interface InstrumentDriver {
  /** Emit one SoW exchange: start, one added, end. */
  emitInitialSoW(): Promise<void>;
  /** Add one instrument after SoW. */
  addInstrumentAfterSoW(): Promise<void>;
}

export interface InstrumentHarness {
  port: InstrumentPort;
  driver: InstrumentDriver;
  teardown: () => void;
  /**
   * Set to false for static simulators that only emit one snapshot and
   * cannot produce a subsequent emission after the initial SoW.
   * Defaults to true.
   */
  supportsLiveAdd?: boolean;
}

export function describeInstrumentPortContract(
  label: string,
  makeHarness: () => InstrumentHarness,
): void {
  describe(`${label} :: InstrumentPort contract`, () => {
    it("first emission contains the SoW set as a full snapshot", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getInstruments());
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
          port.getInstruments().pipe(take(2), toArray()),
        );
        await driver.emitInitialSoW();
        await driver.addInstrumentAfterSoW();
        const emissions = await promise;
        expect(emissions).toHaveLength(2);
        expect(defined(emissions[1]).length).toBeGreaterThan(
          defined(emissions[0]).length,
        );
      } finally {
        teardown();
      }
    });
  });
}
