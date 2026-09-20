import { describe, expect, it } from "vitest";

import type { RfqState } from "@rtc/core-api";
import {
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createRfqQuoteResult, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };

function statuses(values: readonly RfqState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

function receivedRemaining(values: readonly RfqState[]): number[] {
  return values
    .filter((state) => {
      return state.status === "received";
    })
    .map((state) => {
      return state.remainingMs;
    });
}

export function describeRfqTileContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts init; requestQuote() → requested with the pair's symbol and pips pending; a result → received with the quote and RFQ_TIMEOUT_MS remaining", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([INIT]);
          m.intents.requestQuote();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested"]);
          expect(h.driver.pendingRfqQuotes()).toEqual([
            { symbol: "EURUSD", pipsPosition: EURUSD.pipsPosition },
          ]);
          const result = createRfqQuoteResult(1.1);
          h.driver.resolveRfqQuote(result);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "received",
            quote: {
              bid: result.bid,
              ask: result.ask,
              timeoutMs: RFQ_TIMEOUT_MS,
            },
            remainingMs: RFQ_TIMEOUT_MS,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("counts down one interval per RFQ_COUNTDOWN_INTERVAL_MS, auto-rejects at RFQ_TIMEOUT_MS, returns to init REJECTED_DISPLAY_MS later", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)?.remainingMs).toBe(
            RFQ_TIMEOUT_MS - RFQ_COUNTDOWN_INTERVAL_MS,
          );
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)?.remainingMs).toBe(
            RFQ_TIMEOUT_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS,
          );
          await clock.advance(
            RFQ_TIMEOUT_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS - 1,
          );
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("received");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          const ticks = receivedRemaining(c.values);
          expect(ticks[0]).toBe(RFQ_TIMEOUT_MS);
          expect(ticks.at(-1)).toBe(RFQ_COUNTDOWN_INTERVAL_MS);

          for (let i = 1; i < ticks.length; i += 1) {
            expect((ticks[i - 1] ?? 0) - (ticks[i] ?? 0)).toBe(
              RFQ_COUNTDOWN_INTERVAL_MS,
            );
          }

          await clock.advance(REJECTED_DISPLAY_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failing quote request → rejected, then init after REJECTED_DISPLAY_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.failRfqQuote(new Error("bust"));
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested", "rejected"]);
          await clock.advance(REJECTED_DISPLAY_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual([
            "init",
            "requested",
            "rejected",
            "init",
          ]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("cancel() from requested withdraws the pending request and returns to init; accept() from received returns to init; reject() from received shows rejected then init", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          m.intents.cancel();
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          m.intents.accept();
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.2));
          await clock.settle();
          m.intents.reject();
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          await clock.advance(REJECTED_DISPLAY_MS);
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          // The rejected hold ended the countdown: no received tick lands later.
          const ticksBefore = receivedRemaining(c.values).length;
          await clock.advance(RFQ_TIMEOUT_MS);
          await clock.settle();
          expect(receivedRemaining(c.values)).toHaveLength(ticksBefore);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("intents are no-ops outside their state: requestQuote() only from init, cancel() only from requested, accept()/reject() only from received", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.cancel();
          m.intents.accept();
          m.intents.reject();
          await clock.settle();
          expect(c.values).toEqual([INIT]);
          m.intents.requestQuote();
          await clock.settle();
          m.intents.requestQuote();
          m.intents.accept();
          m.intents.reject();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested"]);
          expect(h.driver.pendingRfqQuotes()).toHaveLength(1);
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          m.intents.cancel();
          m.intents.requestQuote();
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("received");
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() ends the run and its timers; a fresh subscription afterwards yields the current value synchronously", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          c.unsubscribe();
          m.dispose();
          await clock.settle();
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          const fresh = collect(m.state$);
          expect(fresh.values).toHaveLength(1);
          fresh.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
