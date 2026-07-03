import { RfqTilesPanel } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

const instruments: readonly Instrument[] = [
  {
    id: 1,
    name: "US Treasury 10Y",
    cusip: "912828ZQ6",
    ticker: "T 1.5 02/34",
    maturity: "2034-02-15",
    interestRate: 1.5,
    benchmark: "10Y",
    refPrice: 98.4,
  },
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
    refPrice: 99.8,
  },
];
const dealers: readonly Dealer[] = [
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
];

describe("RfqTilesPanel", () => {
  it("shows the empty state when there are no RFQs", () => {
    const panel = mount(RfqTilesPanel, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    expect(panel.emptyMessage()).toMatch(/no rfqs to display/i);
    expect(panel.cardCount()).toBe(0);
  });

  it("shows only live RFQs by default", () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
        ],
      },
    });
    expect(panel.cardCount()).toBe(1);
    expect(panel.hasText("US Treasury 10Y")).toBe(true);
  });

  it("switches the visible RFQs when the filter changes", async () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Expired }),
          rfq(4, { state: RfqState.Cancelled }),
        ],
      },
    });
    expect(panel.cardCount()).toBe(1); // Live

    await panel.selectFilter("All");
    expect(panel.cardCount()).toBe(4);

    await panel.selectFilter("Done");
    expect(panel.cardCount()).toBe(1);

    await panel.selectFilter("Expired");
    expect(panel.cardCount()).toBe(1);

    await panel.selectFilter("Cancelled");
    expect(panel.cardCount()).toBe(1);
  });

  it("shows the empty state when the active filter matches no RFQs", async () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    await panel.selectFilter("Done");
    expect(panel.emptyMessage()).toMatch(/no rfqs to display/i);
  });

  it("dismisses a non-live RFQ so it disappears from the list", async () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Closed })],
      },
    });
    await panel.selectFilter("All");
    expect(panel.cardCount()).toBe(1);
    await panel.dismissFirst();
    expect(panel.cardCount()).toBe(0);
  });

  it("accepts a quote through the panel, recording the quote id", async () => {
    const acceptedQuote: Quote = {
      id: 555,
      rfqId: 1,
      dealerId: 2,
      state: { type: "pendingWithPrice", price: 99 },
    };
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      parametric: { quotesForRfq: { 1: [acceptedQuote] } },
    });
    await panel.acceptFirstQuote();
    expect(panel.acceptedQuoteIds()).toEqual([555]);
  });

  it("appends a newly streamed RFQ", () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    expect(panel.cardCount()).toBe(1);
    panel.emit({
      useRfqs: [
        rfq(1, { state: RfqState.Open }),
        rfq(2, { state: RfqState.Open }),
      ],
    });
    expect(panel.cardCount()).toBe(2);
  });

  it("re-renders a card when its quotes arrive via the parametric source", () => {
    const panel = mount(RfqTilesPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    expect(panel.hasText("$77")).toBe(false);
    panel.setQuotesForRfq(1, [
      {
        id: 1,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 77 },
      },
    ]);
    expect(panel.hasText("$77")).toBe(true);
  });
});

function rfq(id: number, over: Partial<Rfq> = {}): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 1000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 1_700_000_000_000 + id,
    ...over,
  };
}
