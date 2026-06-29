import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it } from "vitest";

import type { OrderPort } from "../orderPort.js";

export interface OrderDriver {
  /** Advance the simulated clock past the full place() lifecycle. */
  settlePlacement(): Promise<void>;
  /** Resolve a pending orders() snapshot. */
  ackOrders(): Promise<void>;
  /** Resolve a pending cancel(). */
  ackCancel(): Promise<void>;
}
export interface OrderHarness {
  port: OrderPort;
  driver: OrderDriver;
  teardown: () => void;
}

export function describeOrderPortContract(
  label: string,
  makeHarness: () => OrderHarness,
): void {
  describe(`${label} :: OrderPort contract`, () => {
    it("place emits new → working → ... → filled, ending filled", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const collected = lastValueFrom(
          port
            .place({ symbol: "AAPL", side: "buy", type: "market", qty: 100 })
            .pipe(toArray()),
        );
        await driver.settlePlacement();
        const updates = await collected;
        expect(updates[0]?.status).toBe("new");
        const last = updates[updates.length - 1];
        expect(last?.status).toBe("filled");
        expect(last?.filledQty).toBe(100);
      } finally {
        teardown();
      }
    });

    it("orders emits an array snapshot of placed orders", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        await lastValueFrom(
          port
            .place({ symbol: "AAPL", side: "buy", type: "market", qty: 50 })
            .pipe(toArray()),
          { defaultValue: [] },
        );
        await driver.settlePlacement();
        const snapshot = lastValueFrom(port.orders().pipe(toArray()));
        await driver.ackOrders();
        const arrays = await snapshot;
        expect(Array.isArray(arrays[arrays.length - 1])).toBe(true);
      } finally {
        teardown();
      }
    });

    it("cancel completes with no value", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const done = lastValueFrom(port.cancel("nonexistent").pipe(toArray()));
        await driver.ackCancel();
        await expect(done).resolves.toSatisfy((values: readonly unknown[]) =>
          values.every((v) => v === undefined),
        );
      } finally {
        teardown();
      }
    });
  });
}
