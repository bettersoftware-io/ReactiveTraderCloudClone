import { describe, expect, it } from "vitest";

import {
  CREDIT_QUANTITY_MULTIPLIER,
  Direction,
  RFQ_DEFAULT_EXPIRY_SECS,
  type RfqEvent,
  RfqState,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createQuote, createRfq } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const START: RfqEvent = { type: "startOfStateOfTheWorld" };
const END: RfqEvent = { type: "endOfStateOfTheWorld" };

export function describeRfqsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("rfqs$ is silent until the first event; start-of-world yields []; each created RFQ appends; end-of-world does not re-emit", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.rfqs.rfqs$);
        expect(c.values).toEqual([]);
        h.driver.emitRfqEvent(START);
        await settle();
        expect(c.values).toEqual([[]]);
        const one = createRfq({ id: 1 });
        const two = createRfq({ id: 2 });
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: one });
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: two });
        h.driver.emitRfqEvent(END);
        await settle();
        expect(c.values).toEqual([[], [one], [one, two]]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("rfqClosed replaces the RFQ with the same id in place; a quote event leaves rfqs$ silent", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.rfqs.rfqs$);
        const open = createRfq({ id: 1 });
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: open });
        await settle();
        h.driver.emitRfqEvent({
          type: "quoteCreated",
          payload: createQuote({ id: 5, rfqId: 1 }),
        });
        await settle();
        expect(c.values).toHaveLength(2);
        const closed = createRfq({ id: 1, state: RfqState.Closed });
        h.driver.emitRfqEvent({ type: "rfqClosed", payload: closed });
        await settle();
        expect(c.values.at(-1)).toEqual([closed]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("allQuotes$ is the quote map keyed by quote id, re-emitted on quote events only; quotesForRfq$(id) filters it and is memoised per id", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        expect(p.quotesForRfq$(1)).toBe(p.quotesForRfq$(1));
        const all = collect(p.allQuotes$);
        const forOne = collect(p.quotesForRfq$(1));
        const forTwo = collect(p.quotesForRfq$(2));
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({
          type: "rfqCreated",
          payload: createRfq({ id: 1 }),
        });
        await settle();
        const quotesAfterRfq = all.values.length;
        const q1 = createQuote({ id: 10, rfqId: 1, dealerId: 1 });
        const q2 = createQuote({ id: 11, rfqId: 2, dealerId: 1 });
        h.driver.emitRfqEvent({ type: "quoteCreated", payload: q1 });
        h.driver.emitRfqEvent({ type: "quoteCreated", payload: q2 });
        await settle();
        expect(all.values.length).toBe(quotesAfterRfq + 2);
        expect(Array.from(all.values.at(-1)?.entries() ?? [])).toEqual([
          [10, q1],
          [11, q2],
        ]);
        expect(forOne.values.at(-1)).toEqual([q1]);
        expect(forTwo.values.at(-1)).toEqual([q2]);
        const quoted = createQuote({
          id: 10,
          rfqId: 1,
          dealerId: 1,
          state: { type: "pendingWithPrice", price: 101 },
        });
        h.driver.emitRfqEvent({ type: "quoteQuoted", payload: quoted });
        await settle();
        expect(forOne.values.at(-1)).toEqual([quoted]);
        expect(forTwo.values.at(-1)).toEqual([q2]);
        all.unsubscribe();
        forOne.unsubscribe();
        forTwo.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("events$ is the raw event stream, replay-current: a late joiner hears the last event", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const c = collect(p.events$);
        h.driver.emitRfqEvent(START);
        const created: RfqEvent = { type: "rfqCreated", payload: createRfq() };
        h.driver.emitRfqEvent(created);
        await settle();
        expect(c.values).toEqual([START, created]);
        const late = collect(p.events$);
        expect(late.values).toEqual([created]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh rfqs$ subscriber replays the roster synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const first = collect(p.rfqs$);
        const one = createRfq({ id: 1 });
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: one });
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.rfqEventsObserved()).toBe(true);
        const again = collect(p.rfqs$);
        expect(again.values).toEqual([[one]]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("createRfq is lazy and maps the UI input to the port request: quantity × CREDIT_QUANTITY_MULTIPLIER, expiry defaulted, dealer ids copied; the id lands as the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const dealerIds = [1, 2];
        const created = p.createRfq({
          instrumentId: 7,
          dealerIds,
          quantity: 5,
          direction: Direction.Sell,
        });
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        const c = collect(created);
        await settle();
        const pending = h.driver.pendingWorkflowCommands();
        expect(pending).toEqual([
          {
            kind: "createRfq",
            request: {
              instrumentId: 7,
              dealerIds: [1, 2],
              quantity: 5 * CREDIT_QUANTITY_MULTIPLIER,
              direction: Direction.Sell,
              expirySecs: RFQ_DEFAULT_EXPIRY_SECS,
            },
          },
        ]);
        h.driver.resolveWorkflowCommand(42);
        await settle();
        expect(c.values).toEqual([42]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("acceptQuote, cancelRfq, passQuote and quoteRfq each issue their command on subscribe and complete without error when settled; a failed command errors the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const accept = collect(p.acceptQuote(7));
        const cancel = collect(p.cancelRfq(3));
        const pass = collect(p.passQuote(8));
        const quote = collect(p.quoteRfq({ quoteId: 9, price: 101.5 }));
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "accept", quoteId: 7 },
          { kind: "cancelRfq", rfqId: 3 },
          { kind: "pass", quoteId: 8 },
          { kind: "quote", request: { quoteId: 9, price: 101.5 } },
        ]);
        h.driver.resolveWorkflowCommand();
        h.driver.resolveWorkflowCommand();
        h.driver.resolveWorkflowCommand();
        h.driver.failWorkflowCommand(new Error("bust"));
        await settle();
        expect(accept.errors).toEqual([]);
        expect(cancel.errors).toEqual([]);
        expect(pass.errors).toEqual([]);
        expect(quote.errors).toHaveLength(1);
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        accept.unsubscribe();
        cancel.unsubscribe();
        pass.unsubscribe();
        quote.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
