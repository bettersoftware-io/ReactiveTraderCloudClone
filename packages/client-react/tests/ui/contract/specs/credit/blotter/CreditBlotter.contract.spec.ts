import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { CreditBlotter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

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
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
  },
];
const dealers: readonly Dealer[] = [
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
];

// 2024-03-05 in UTC (avoid TZ flakiness by asserting the day/month/year parts).
const TS = Date.UTC(2024, 2, 5, 12, 0, 0);

const rfq = (id: number, over: Partial<Rfq> = {}): Rfq => ({
  id,
  instrumentId: 1,
  quantity: 5000,
  direction: Direction.Buy,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: TS,
  ...over,
});

const acceptedQuote = (
  id: number,
  rfqId: number,
  over: Partial<Quote> = {},
): Quote => ({
  id,
  rfqId,
  dealerId: 2,
  state: { type: "accepted", price: 99 },
  ...over,
});

const quoteMap = (...quotes: Quote[]): ReadonlyMap<number, Quote> =>
  new Map(quotes.map((q) => [q.id, q]));

describe("CreditBlotter", () => {
  it("shows the column headers", () => {
    const blotter = mount(CreditBlotter, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    const headers = blotter.columnHeaders();
    expect(headers).toContain("Trade ID");
    expect(headers).toContain("Counterparty");
    expect(headers).toContain("Unit Price");
  });

  it("shows the empty state when there are no closed-and-accepted RFQs", () => {
    const blotter = mount(CreditBlotter, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no credit trades yet/i);
  });

  it("derives a trade row from a closed RFQ with an accepted quote", () => {
    const blotter = mount(CreditBlotter, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1)],
        useAllQuotes: quoteMap(acceptedQuote(900, 1)),
      },
    });
    expect(blotter.tradeRowCount()).toBe(1);
    expect(blotter.hasCell("Citi")).toBe(true); // counterparty
    expect(blotter.hasCell("912828ZQ6")).toBe(true); // cusip
    expect(blotter.hasCell("T 1.5 02/34")).toBe(true); // security/ticker
    expect(blotter.hasCell("5,000")).toBe(true); // quantity
    expect(blotter.hasCell("$99")).toBe(true); // unit price
    expect(blotter.hasCell("05-Mar-2024")).toBe(true); // formatted trade date
    expect(blotter.hasCell("AON")).toBe(true);
  });

  it("ignores RFQs that are not closed", () => {
    const blotter = mount(CreditBlotter, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
        useAllQuotes: quoteMap(acceptedQuote(900, 1)),
      },
    });
    expect(blotter.tradeRowCount()).toBe(0);
  });

  it("ignores closed RFQs whose quotes were not accepted", () => {
    const blotter = mount(CreditBlotter, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1)],
        useAllQuotes: quoteMap(
          acceptedQuote(900, 1, {
            state: { type: "rejectedWithPrice", price: 99 },
          }),
        ),
      },
    });
    expect(blotter.tradeRowCount()).toBe(0);
  });

  it("falls back to placeholder counterparty/instrument data when lookups miss", () => {
    const blotter = mount(CreditBlotter, {
      hooks: {
        useInstruments: [], // unknown instrument
        useDealers: [], // unknown dealer
        useRfqs: [rfq(1, { instrumentId: 99 })],
        useAllQuotes: quoteMap(acceptedQuote(900, 1, { dealerId: 42 })),
      },
    });
    expect(blotter.tradeRowCount()).toBe(1);
    expect(blotter.hasCell("Dealer 42")).toBe(true);
  });

  it("sorts trades by descending trade id", () => {
    const blotter = mount(CreditBlotter, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { instrumentId: 1 }), rfq(2, { instrumentId: 2 })],
        useAllQuotes: quoteMap(acceptedQuote(900, 1), acceptedQuote(901, 2)),
      },
    });
    expect(blotter.tradeRowCount()).toBe(2);
    // The newest (highest trade id) trade appears first.
    expect(blotter.columnValues("Trade ID")).toEqual(["2", "1"]);
  });

  it("appends a derived trade when a closed-and-accepted RFQ streams in", () => {
    const blotter = mount(CreditBlotter, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    expect(blotter.tradeRowCount()).toBe(0);
    blotter.emit({
      useRfqs: [rfq(1)],
      useAllQuotes: quoteMap(acceptedQuote(900, 1)),
    });
    expect(blotter.tradeRowCount()).toBe(1);
  });
});
