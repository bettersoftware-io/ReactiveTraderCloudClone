import { describe, expect, it } from "vitest";

import type { AnimationIntent } from "@rtc/core-api";
import {
  Direction,
  type EquityOrder,
  RfqState,
  TradeStatus,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import {
  createPrice,
  createQuote,
  createRfq,
  createTick,
  createTrade,
  EURUSD,
  GBPUSD,
} from "#/harness/fixtures";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `presenters.animationDirector` — the app's choreography intents, keyed by
 * target. Carried ruling R5: counted emissions settle in between. */
export function describeAnimationDirectorContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a tile ticks up when the mid rises or holds and down when it falls — the first price emits nothing", async () => {
      const h = makeHarness();

      try {
        const c = collect(
          h.app.presenters.animationDirector.intentsFor("tile:EURUSD"),
        );
        h.driver.emitPairs([EURUSD]);
        await settle();

        for (const mid of [1.1, 1.2, 1.2, 1.15]) {
          h.driver.tickPrice(createTick("EURUSD", mid));
          await settle();
        }

        expect(kinds(c.values)).toEqual(["tickUp", "tickUp", "tickDown"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("another target hears none of it, and a pair dropped from the roster stops ticking", async () => {
      const h = makeHarness();

      try {
        const director = h.app.presenters.animationDirector;
        const eur = collect(director.intentsFor("tile:EURUSD"));
        const gbp = collect(director.intentsFor("tile:GBPUSD"));
        h.driver.emitPairs([EURUSD]);
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        await settle();
        expect(kinds(eur.values)).toEqual(["tickUp"]);
        expect(gbp.values).toEqual([]);
        h.driver.emitPairs([GBPUSD]);
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.3));
        await settle();
        expect(kinds(eur.values)).toEqual(["tickUp"]);
        eur.unsubscribe();
        gbp.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("an FX execution that fills flashes fill on its tile; a rejected one flashes reject", async () => {
      const h = makeHarness();

      try {
        const c = collect(
          h.app.presenters.animationDirector.intentsFor("tile:EURUSD"),
        );
        await execute(h, TradeStatus.Done);
        await execute(h, TradeStatus.Rejected);
        expect(kinds(c.values)).toEqual(["fill", "reject"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("an RFQ that closes expired flashes expiry; an accepted quote flashes fill on its RFQ; any other close is silent", async () => {
      const h = makeHarness();

      try {
        const director = h.app.presenters.animationDirector;
        const expired = collect(director.intentsFor("rfq:9"));
        const accepted = collect(director.intentsFor("rfq:4"));
        const other = collect(director.intentsFor("rfq:5"));
        await settle();
        h.driver.emitRfqEvent({
          type: "rfqClosed",
          payload: createRfq({ id: 9, state: RfqState.Expired }),
        });
        await settle();
        h.driver.emitRfqEvent({
          type: "rfqClosed",
          payload: createRfq({ id: 5, state: RfqState.Cancelled }),
        });
        await settle();
        h.driver.emitRfqEvent({
          type: "quoteAccepted",
          payload: createQuote({ rfqId: 4 }),
        });
        await settle();
        expect(kinds(expired.values)).toEqual(["expiry"]);
        expect(kinds(accepted.values)).toEqual(["fill"]);
        expect(other.values).toEqual([]);
        expired.unsubscribe();
        accepted.unsubscribe();
        other.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a connection status CHANGE flashes the banner; the status current at subscribe does not", async () => {
      const h = makeHarness();

      try {
        const c = collect(
          h.app.presenters.animationDirector.intentsFor("banner:connection"),
        );
        await settle();
        expect(c.values).toEqual([]);
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        await settle();
        expect(kinds(c.values)).toEqual(["connectionChange"]);
        // Uncontracted: whether a REPEAT of the same status flashes again
        // (the RxJS core's connection fold does not conflate it, so it does).
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a filled equity order flashes fill on its ticket", async () => {
      const h = makeHarness();

      try {
        const c = collect(
          h.app.presenters.animationDirector.intentsFor("ticket:AAPL"),
        );

        const placed = collect(
          h.app.presenters.ordersBlotter.place({
            symbol: "AAPL",
            side: "buy",
            type: "market",
            qty: 100,
          }),
        );
        await settle();
        h.driver.emitOrderUpdate(createFilledOrder());
        await settle();
        expect(kinds(c.values)).toEqual(["fill"]);
        c.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function kinds(intents: readonly AnimationIntent[]): readonly string[] {
  return intents.map((intent) => {
    return intent.kind;
  });
}

async function execute(h: CoreHarness, status: TradeStatus): Promise<void> {
  const run = collect(
    h.app.presenters.execution.execute({
      pair: EURUSD,
      direction: Direction.Buy,
      price: createPrice("EURUSD", 1.1),
      notional: 1,
    }),
  );
  await settle();
  h.driver.resolveExecution(createTrade({ status }));
  await settle();
  run.unsubscribe();
}

function createFilledOrder(): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    createdAt: 0,
  };
}
