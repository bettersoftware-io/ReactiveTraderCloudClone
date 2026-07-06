import { RfqsPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

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
];

const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JPMorgan" },
];

describe("RfqsPanel", () => {
  it("shows the empty state when there are no RFQs", () => {
    const panel = mount(RfqsPanel, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    expect(panel.emptyMessage()).toBe("No RFQs to show");
    expect(panel.cardCount()).toBe(0);
  });

  it("defaults to the live filter, showing only Open RFQs", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
    });
    expect(panel.cardCount()).toBe(1);
    expect(panel.cardState(1)).toBe("live");
  });

  it("the closed filter shows every non-Open RFQ", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "closed",
    });
    expect(panel.cardCount()).toBe(3);
    expect(panel.cardState(2)).toBe("accepted");
    expect(panel.cardState(3)).toBe("terminated");
    expect(panel.cardState(4)).toBe("terminated");
  });

  it("the all filter shows every RFQ regardless of state", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(panel.cardCount()).toBe(4);
  });

  it("renders the LIVE/ACCEPTED/CANCELLED/EXPIRED state labels", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    expect(panel.hasText("LIVE")).toBe(true);

    const closedPanel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(closedPanel.hasText("ACCEPTED")).toBe(true);
    expect(closedPanel.hasText("CANCELLED")).toBe(true);
    expect(closedPanel.hasText("EXPIRED")).toBe(true);
  });

  it("marks the best-priced quote with a star and the Adaptive Bank row as house", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 1,
        state: { type: "pendingWithPrice", price: 99 },
      },
      {
        id: 11,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 97 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.isBestQuote(11)).toBe(true);
    expect(panel.isBestQuote(10)).toBe(false);
    expect(panel.isHouseQuote(10)).toBe(true);
    expect(panel.isHouseQuote(11)).toBe(false);
  });

  it("accepts a priced quote through the panel, recording the quote id", async () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 99 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.canAccept(10)).toBe(true);
    await panel.accept(10);
    expect(panel.acceptedQuoteIds()).toEqual([10]);
  });

  it("does not offer accept once the RFQ is no longer live, even for a priced quote", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 99 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Cancelled })],
      },
      creditRfqFilter: "all",
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.canAccept(10)).toBe(false);
  });

  it("cancels a live RFQ through the panel, recording the rfq id", async () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    await panel.cancel(1);
    expect(panel.cancelledRfqIds()).toEqual([1]);
  });

  it("shows the accepted dealer's name once Closed", () => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 3, state: { type: "accepted", price: 97 } },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Closed })],
      },
      creditRfqFilter: "closed",
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.hasText("You traded with JPMorgan")).toBe(true);
  });

  it("removes a terminated RFQ from view via its remove control", async () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Expired })],
      },
      creditRfqFilter: "all",
    });
    expect(panel.cardCount()).toBe(1);
    await panel.remove(1);
    expect(panel.cardCount()).toBe(0);
    expect(panel.emptyMessage()).toBe("No RFQs to show");
  });

  it("does not offer a remove control on a live or accepted card", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(panel.hasRemoveControl(1)).toBe(false);
    expect(panel.hasRemoveControl(2)).toBe(false);
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
