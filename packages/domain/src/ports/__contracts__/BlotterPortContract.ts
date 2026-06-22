import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { defined } from "../../__testUtils__/defined.js";
import type { BlotterPort } from "../blotterPort.js";

export interface BlotterDriver {
  emitInitialBlotter(): Promise<void>;
  appendTrade(): Promise<void>;
}

export interface BlotterHarness {
  port: BlotterPort;
  driver: BlotterDriver;
  teardown: () => void;
}

export function describeBlotterPortContract(
  label: string,
  makeHarness: () => BlotterHarness,
): void {
  describe(`${label} :: BlotterPort contract`, () => {
    it("emits an initial snapshot (possibly empty)", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.getTradeStream());
        await driver.emitInitialBlotter();
        const initial = await promise;
        expect(Array.isArray(initial)).toBe(true);
      } finally {
        teardown();
      }
    });

    it("each new trade produces a cumulative snapshot containing prior trades", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(
          port.getTradeStream().pipe(take(2), toArray()),
        );
        await driver.emitInitialBlotter();
        await driver.appendTrade();
        const emissions = await promise;
        expect(emissions).toHaveLength(2);
        expect(defined(emissions[1]).length).toBeGreaterThanOrEqual(
          defined(emissions[0]).length,
        );
      } finally {
        teardown();
      }
    });
  });
}
