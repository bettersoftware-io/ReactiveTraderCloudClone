import { describe, expect, it } from "@jest/globals";

import { type CurrencyPair, Direction } from "@rtc/domain";

import { creditSlice } from "./credit";

/** A fully-specified `CurrencyPair` for the sole purpose of calling
 * `useRfqTile` (an FX-tile-only hook `client-react-native` never actually
 * calls — see `credit.ts`'s header comment) with a type-correct argument;
 * its field values are otherwise unused by this slice's fixed return. */
const DUMMY_PAIR: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.1,
  typicalSpreadPips: 1.5,
};

describe("creditSlice.useRfqCountdown", () => {
  it("returns the identical value on two successive calls", () => {
    const first = creditSlice.useRfqCountdown(0, 120_000);
    const second = creditSlice.useRfqCountdown(0, 120_000);

    expect(second).toBe(first);
  });

  it("returns the identical value after an await tick — this is the assertion that fails if anyone reintroduces a real (clock-driven) countdown", async () => {
    const before = creditSlice.useRfqCountdown(0, 120_000);
    await Promise.resolve();
    const after = creditSlice.useRfqCountdown(0, 120_000);

    expect(after).toBe(before);
  });

  it("derives a mid-window value — not full, not empty, not exactly half", () => {
    const remainingMs = creditSlice.useRfqCountdown(0, 120_000);

    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThan(120_000);
    expect(remainingMs).not.toBe(60_000);
  });

  it("ignores creationTimestamp — same totalMs yields the same value regardless", () => {
    const atZero = creditSlice.useRfqCountdown(0, 120_000);
    const atAnotherInstant = creditSlice.useRfqCountdown(
      1_700_000_000_000,
      120_000,
    );

    expect(atAnotherInstant).toBe(atZero);
  });
});

describe("creditSlice.useQuotesForRfq", () => {
  it("returns the same array reference for the same rfqId across calls", () => {
    const rfqId = creditSlice.useRfqs()[0]?.id;
    expect(rfqId).toBeDefined();

    const first = creditSlice.useQuotesForRfq(rfqId as number);
    const second = creditSlice.useQuotesForRfq(rfqId as number);

    expect(second).toBe(first);
  });

  it("returns an empty array — never undefined — for an unknown rfqId", () => {
    const quotes = creditSlice.useQuotesForRfq(-1);

    expect(quotes).toBeDefined();
    expect(quotes).toStrictEqual([]);
  });

  it("returns the same empty-array reference for two different unknown rfqIds", () => {
    const first = creditSlice.useQuotesForRfq(-1);
    const second = creditSlice.useQuotesForRfq(-2);

    expect(second).toBe(first);
  });
});

describe("creditSlice.useRfqs", () => {
  it("covers more than one RfqState arm", () => {
    const states = new Set(
      creditSlice.useRfqs().map((rfq) => {
        return rfq.state;
      }),
    );

    expect(states.size).toBeGreaterThan(1);
  });

  it("returns the same array reference on every call", () => {
    expect(creditSlice.useRfqs()).toBe(creditSlice.useRfqs());
  });
});

describe("creditSlice.useQuotesForRfq — quote union coverage", () => {
  it("covers more than one Quote.state arm across the fixture RFQs", () => {
    const allQuoteStateTypes = new Set(
      creditSlice.useRfqs().flatMap((rfq) => {
        return creditSlice.useQuotesForRfq(rfq.id).map((quote) => {
          return quote.state.type;
        });
      }),
    );

    expect(allQuoteStateTypes.size).toBeGreaterThan(1);
  });
});

describe("creditSlice async commands", () => {
  it("useAcceptQuote's command resolves without throwing", async () => {
    await expect(creditSlice.useAcceptQuote()(1)).resolves.toBeUndefined();
  });

  it("useCancelRfq's command resolves without throwing", async () => {
    await expect(creditSlice.useCancelRfq()(1)).resolves.toBeUndefined();
  });
});

describe("creditSlice — remaining hooks are correct, inert values", () => {
  it("useCreditRfqFilterPreference starts on the filter that surfaces the tiles scenario's RFQs", () => {
    const { filter, setFilter } = creditSlice.useCreditRfqFilterPreference();

    expect(filter).toBe("live");
    expect(() => {
      setFilter("all");
    }).not.toThrow();
  });

  it("useDealers / useInstruments return non-empty, stable-reference literals", () => {
    expect(creditSlice.useDealers().length).toBeGreaterThan(0);
    expect(creditSlice.useDealers()).toBe(creditSlice.useDealers());
    expect(creditSlice.useInstruments().length).toBeGreaterThan(0);
    expect(creditSlice.useInstruments()).toBe(creditSlice.useInstruments());
  });

  it("useAllQuotes returns a stable map keyed by quote id", () => {
    const first = creditSlice.useAllQuotes();
    const second = creditSlice.useAllQuotes();

    expect(second).toBe(first);
    expect(first.size).toBeGreaterThan(0);
  });

  it("useRfqTile returns the resting arm and no-op intents that do not throw", () => {
    const tile = creditSlice.useRfqTile(DUMMY_PAIR);

    expect(tile.state).toStrictEqual({
      status: "init",
      quote: null,
      remainingMs: 0,
    });
    expect(() => {
      tile.requestQuote();
      tile.cancel();
      tile.reject();
      tile.accept();
    }).not.toThrow();
  });

  it("useRfqSubmission returns the initial editing arm and a no-op submit", () => {
    const submission = creditSlice.useRfqSubmission();

    expect(submission.state).toStrictEqual({ status: "editing" });
    expect(() => {
      submission.submit(
        {
          instrumentId: 1,
          dealerIds: [1],
          quantity: 1_000,
          direction: Direction.Buy,
        },
        () => {},
      );
    }).not.toThrow();
  });

  it("useTicketSubmission returns the initial un-submitted arm and no-op intents", () => {
    const ticket = creditSlice.useTicketSubmission();

    expect(ticket.state).toStrictEqual({ submitted: false });
    expect(() => {
      ticket.submitPrice(1, 100);
      ticket.pass(1);
    }).not.toThrow();
  });
});
