import { SellSidePanel } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_BANK_NAME,
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
  },
];
const withAdaptive: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
];

const rfq = (id: number, over: Partial<Rfq> = {}): Rfq => ({
  id,
  instrumentId: 1,
  quantity: 2500,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_700_000_000_000 + id,
  ...over,
});

const adaptiveQuote = (rfqId: number): Quote => ({
  id: rfqId * 10,
  rfqId,
  dealerId: 1, // Adaptive Bank
  state: { type: "pendingWithoutPrice" },
});

describe("SellSidePanel", () => {
  it("shows the panel title", () => {
    const panel = mount(SellSidePanel, {
      hooks: { useInstruments: instruments, useDealers: withAdaptive },
    });
    expect(panel.hasText(/sell side/i)).toBe(true);
  });

  it("shows the empty state when Adaptive Bank is not among the dealers", () => {
    const panel = mount(SellSidePanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: [{ id: 2, name: "Citi" }],
        useRfqs: [rfq(1)],
      },
    });
    expect(panel.emptyMessage()).toMatch(/no rfqs for adaptive bank/i);
  });

  it("shows the empty state when there are no RFQs", () => {
    const panel = mount(SellSidePanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: withAdaptive,
        useRfqs: [],
      },
    });
    expect(panel.emptyMessage()).toMatch(/no rfqs for adaptive bank/i);
  });

  it("renders a ticket only for RFQs that carry an Adaptive Bank quote", () => {
    const panel = mount(SellSidePanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: withAdaptive,
        useRfqs: [rfq(1), rfq(2)],
      },
      parametric: {
        // RFQ 1 has an Adaptive Bank quote; RFQ 2 has only a Citi quote → skipped.
        quotesForRfq: {
          1: [adaptiveQuote(1)],
          2: [
            {
              id: 99,
              rfqId: 2,
              dealerId: 2,
              state: { type: "pendingWithoutPrice" },
            },
          ],
        },
      },
    });
    expect(panel.ticketCount()).toBe(1);
    expect(panel.hasText("US Treasury 10Y")).toBe(true);
  });

  it("renders a ticket once its Adaptive Bank quote streams in", () => {
    const panel = mount(SellSidePanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: withAdaptive,
        useRfqs: [rfq(1)],
      },
    });
    expect(panel.ticketCount()).toBe(0);
    panel.setQuotesForRfq(1, [adaptiveQuote(1)]);
    expect(panel.ticketCount()).toBe(1);
  });
});
