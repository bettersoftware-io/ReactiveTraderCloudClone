import {
  Direction,
  type Instrument,
  type Quote,
  type QuoteState,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { TradeTicket } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

const instrument: Instrument = {
  id: 1,
  name: "US Treasury 10Y",
  cusip: "912828ZQ6",
  ticker: "T 1.5 02/34",
  maturity: "2034-02-15",
  interestRate: 1.5,
  benchmark: "10Y",
};

const rfq = (over: Partial<Rfq> = {}): Rfq => ({
  id: 10,
  instrumentId: 1,
  quantity: 2500,
  direction: Direction.Sell,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_700_000_000_000,
  ...over,
});

const quote = (state: QuoteState): Quote => ({
  id: 100,
  rfqId: 10,
  dealerId: 1,
  state,
});

describe("TradeTicket", () => {
  it("shows the instrument details and an active price form when awaiting a response", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    expect(ticket.title()).toBe("US Treasury 10Y");
    expect(ticket.hasText(/912828ZQ6/)).toBe(true);
    expect(ticket.isActive()).toBe(true);
  });

  it("falls back to an instrument-id label when the instrument is unknown", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument: undefined,
      },
    });
    expect(ticket.title()).toBe("Instrument #1");
  });

  it("keeps Submit disabled until a price is entered", async () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    expect(ticket.isSubmitDisabled()).toBe(true);
    await ticket.setPrice("99");
    expect(ticket.isSubmitDisabled()).toBe(false);
  });

  it("submits the quoted price and records it on the quote-RFQ command", async () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    await ticket.setPrice("101.5");
    await ticket.submit();
    expect(ticket.quoteRfqInputs()).toEqual([{ quoteId: 100, price: 101.5 }]);
    // After submitting, the active form is replaced by the responded view.
    expect(ticket.isActive()).toBe(false);
  });

  it("ignores a submit with a non-positive price", async () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    await ticket.setPrice("0");
    await ticket.submit();
    expect(ticket.quoteRfqInputs()).toEqual([]);
    expect(ticket.isActive()).toBe(true);
  });

  it("records a pass and shows the responded view", async () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    await ticket.pass();
    expect(ticket.passedQuoteIds()).toEqual([100]);
    expect(ticket.isActive()).toBe(false);
  });

  it("shows the quoted price for a quote that already has a price", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq(),
        quote: quote({ type: "pendingWithPrice", price: 99 }),
        instrument,
      },
    });
    expect(ticket.isActive()).toBe(false);
    expect(ticket.hasText(/Quoted: \$99/)).toBe(true);
  });

  it("shows Passed for a passed quote", () => {
    const ticket = mount(TradeTicket, {
      props: { rfq: rfq(), quote: quote({ type: "passed" }), instrument },
    });
    expect(ticket.hasText(/^Passed$/)).toBe(true);
  });

  it("shows the RFQ Cancelled message when the RFQ was cancelled but the quote stayed pending", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Cancelled }),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    // Quote still pending-without-price, so it is the non-active, non-responded branch.
    expect(ticket.hasText(/Cancelled/)).toBe(true);
  });

  it("shows Expired in the inactive branch when an expired RFQ still has a pending quote", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Expired }),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    expect(ticket.isActive()).toBe(false);
    expect(ticket.hasText(/^Expired$/)).toBe(true);
  });

  it("shows Closed in the inactive branch when a closed RFQ still has a pending quote", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quote: quote({ type: "pendingWithoutPrice" }),
        instrument,
      },
    });
    expect(ticket.isActive()).toBe(false);
    expect(ticket.hasText(/^Closed$/)).toBe(true);
  });

  it("shows the RFQ Expired message when the RFQ expired with a priced quote", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Expired }),
        quote: quote({ type: "rejectedWithPrice", price: 90 }),
        instrument,
      },
    });
    expect(ticket.hasText(/RFQ Expired/)).toBe(true);
  });

  it("shows a generic Responded message for a closed RFQ with a rejected-without-price quote", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quote: quote({ type: "rejectedWithoutPrice" }),
        instrument,
      },
    });
    expect(ticket.hasText(/Responded/)).toBe(true);
  });

  it("shows the RFQ Cancelled responded message for a cancelled RFQ with a priced quote", () => {
    const ticket = mount(TradeTicket, {
      props: {
        rfq: rfq({ state: RfqState.Cancelled }),
        quote: quote({ type: "rejectedWithPrice", price: 80 }),
        instrument,
      },
    });
    expect(ticket.hasText(/RFQ Cancelled/)).toBe(true);
  });
});
