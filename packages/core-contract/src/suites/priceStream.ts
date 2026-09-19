import { describe, expect, it } from "vitest";

import {
  calculateSpread,
  PRICE_CONFLATION_MS,
  type Price,
  PriceMovementType,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createTick, EURUSD, GBPUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function mid(price: Price): number {
  return price.mid;
}

export function describePriceStreamContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("price$(pair) is memoised per pair: same pair, same stream; another pair, another", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.priceStream;
        expect(p.price$(EURUSD)).toBe(p.price$(EURUSD));
        expect(p.price$(EURUSD)).not.toBe(p.price$(GBPUSD));
      } finally {
        await h.teardown();
      }
    });

    it("emits nothing until the port ticks, then each tick enriched: movement against the previous mid, a spread string", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(c.values).toEqual([]);
        const first = createTick("EURUSD", 1.1);
        h.driver.tickPrice(first);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        h.driver.tickPrice(createTick("EURUSD", 1.15));
        await settle();
        expect(
          c.values.map((p) => {
            return [p.mid, p.movementType];
          }),
        ).toEqual([
          [1.1, PriceMovementType.NONE],
          [1.2, PriceMovementType.UP],
          [1.15, PriceMovementType.DOWN],
        ]);
        expect(c.values[0].spread).toBe(
          calculateSpread(
            first.bid,
            first.ask,
            EURUSD.pipsPosition,
            EURUSD.ratePrecision,
          ),
        );
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber gets the current price synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        const late = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(late.values.map(mid)).toEqual([1.1]);
        first.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("tears down on the last unsubscribe — the port is released, nothing stale is replayed, and the next period's first tick is NONE again", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(true);
        first.unsubscribe();
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(false);
        const again = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(again.values).toEqual([]);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        await settle();
        expect(
          again.values.map((p) => {
            return [p.mid, p.movementType];
          }),
        ).toEqual([[1.2, PriceMovementType.NONE]]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing feed errors the stream; a fresh subscriber starts a new period", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.failPrice("EURUSD", new Error("feed"));
        await settle();
        expect(c.errors).toHaveLength(1);
        const again = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.3));
        await settle();
        expect(again.values.map(mid)).toEqual([1.3]);
        expect(again.errors).toEqual([]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one price per PRICE_CONFLATION_MS: the first at once, the last of a burst at the window's end", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1]);
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.advance(PRICE_CONFLATION_MS - 1);
          expect(c.values.map(mid)).toEqual([1.1]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1, 1.3]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("while not calm, every tick passes through at once", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1, 1.2, 1.3]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("turning calm off takes effect immediately: the next tick passes without waiting for a window", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1]);
          h.app.presenters.powerSaver.setLevel("off");
          await clock.settle();
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.settle();
          // The pending trailing value (1.2) is uncontracted; 1.3 is not.
          expect(c.values.map(mid).at(-1)).toBe(1.3);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
