/* eslint-disable max-classes-per-file -- two local RecordingBlob doubles in separate it() blocks */
import { CreditBlotter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

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

// 2024-03-05 in UTC (avoid TZ flakiness by asserting the day/month/year parts).
const TS = Date.UTC(2024, 2, 5, 12, 0, 0);

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

  describe("sorting", () => {
    const r1 = rfq(1, { instrumentId: 1 });
    const r2 = rfq(2, { instrumentId: 2 });
    const r3 = rfq(3, { instrumentId: 1 });

    it("sorts Trade ID descending on first header click (desc-first column)", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [r1, r2, r3],
          useAllQuotes: quoteMap(
            acceptedQuote(900, 1),
            acceptedQuote(901, 2),
            acceptedQuote(902, 3),
          ),
        },
      });
      await blotter.clickColumnHeader("Trade ID");
      expect(blotter.sortIndicatorFor("Trade ID")).toBe("desc");
      expect(blotter.columnValues("Trade ID")).toEqual(["3", "2", "1"]);
    });

    it("toggles Trade ID sort to ascending on the second click", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [r1, r2, r3],
          useAllQuotes: quoteMap(
            acceptedQuote(900, 1),
            acceptedQuote(901, 2),
            acceptedQuote(902, 3),
          ),
        },
      });
      await blotter.clickColumnHeader("Trade ID");
      await blotter.clickColumnHeader("Trade ID");
      expect(blotter.sortIndicatorFor("Trade ID")).toBe("asc");
      expect(blotter.columnValues("Trade ID")).toEqual(["1", "2", "3"]);
    });

    it("clears the sort on the third click", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [r1, r2, r3],
          useAllQuotes: quoteMap(
            acceptedQuote(900, 1),
            acceptedQuote(901, 2),
            acceptedQuote(902, 3),
          ),
        },
      });
      await blotter.clickColumnHeader("Trade ID");
      await blotter.clickColumnHeader("Trade ID");
      await blotter.clickColumnHeader("Trade ID");
      expect(blotter.sortIndicatorFor("Trade ID")).toBe(null);
      // Back to deriveTrades insertion order (sorted desc by tradeId internally).
      expect(blotter.columnValues("Trade ID")).toEqual(["3", "2", "1"]);
    });
  });

  describe("quick filter", () => {
    it("filters rows to those matching the typed term", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [rfq(1, { instrumentId: 1 }), rfq(2, { instrumentId: 2 })],
          useAllQuotes: quoteMap(
            acceptedQuote(900, 1, { dealerId: 1 }),
            acceptedQuote(901, 2, { dealerId: 2 }),
          ),
        },
      });
      expect(blotter.tradeRowCount()).toBe(2);
      // "Adaptive Bank" is dealerId=1; "Citi" is dealerId=2
      await blotter.typeQuickFilter("Adaptive");
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("Adaptive Bank")).toBe(true);
    });
  });

  describe("column filter", () => {
    it("filters rows via a Counterparty set filter and shows active-filter summary", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [rfq(1, { instrumentId: 1 }), rfq(2, { instrumentId: 2 })],
          useAllQuotes: quoteMap(
            acceptedQuote(900, 1, { dealerId: 1 }),
            acceptedQuote(901, 2, { dealerId: 2 }),
          ),
        },
      });
      await blotter.openColumnFilter("Counterparty");
      // Set filter starts all-selected; unselect "Adaptive Bank" so only "Citi" remains.
      await blotter.toggleSetOption("Adaptive Bank");
      await blotter.applyOpenFilter();
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("Citi")).toBe(true);
      expect(blotter.activeFilterSummary()).toMatch(/counterparty/i);
    });

    it("filters rows via a Quantity number filter (greater-than)", async () => {
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [rfq(1, { quantity: 1000 }), rfq(2, { quantity: 5000 })],
          useAllQuotes: quoteMap(acceptedQuote(900, 1), acceptedQuote(901, 2)),
        },
      });
      await blotter.openColumnFilter("Quantity");
      await blotter.applyNumberFilter("gt", "2000");
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("5,000")).toBe(true);
    });
  });

  describe("CSV export", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("serializes visible trades — header row + one row per trade", async () => {
      const RealBlob = globalThis.Blob;
      let captured = "";
      class RecordingBlob extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          captured = (parts ?? [])
            .map((p) => {
              return String(p);
            })
            .join("");
        }
      }
      vi.stubGlobal("Blob", RecordingBlob);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );

      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [rfq(1), rfq(2)],
          useAllQuotes: quoteMap(acceptedQuote(900, 1), acceptedQuote(901, 2)),
        },
      });
      await blotter.clickExport();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const lines = captured.split("\n");
      // Header must contain all credit columns.
      expect(lines[0]).toBe(
        "Trade ID,Status,Trade Date,Direction,Counterparty,CUSIP,Security,Quantity,Order Type,Unit Price",
      );
      expect(lines).toHaveLength(3); // header + 2 trades

      // quantity and unitPrice are unformatted (raw numbers) in the CSV.
      expect(lines[1]).toContain("5000"); // raw quantity (not "5,000")
      expect(lines[1]).toContain("99"); // raw unit price (not "$99")
    });

    it("formats the trade date as dd-MMM-yyyy in the CSV (2024-03-05 → 05-Mar-2024)", async () => {
      const RealBlob = globalThis.Blob;
      let captured = "";
      class RecordingBlob extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          captured = (parts ?? [])
            .map((p) => {
              return String(p);
            })
            .join("");
        }
      }
      vi.stubGlobal("Blob", RecordingBlob);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );

      // TS is a fixed 2024-03-05 UTC timestamp (already defined above).
      const blotter = mount(CreditBlotter, {
        hooks: {
          useInstruments: instruments,
          useDealers: dealers,
          useRfqs: [rfq(1)],
          useAllQuotes: quoteMap(acceptedQuote(900, 1)),
        },
      });
      await blotter.clickExport();

      const lines = captured.split("\n");
      expect(lines[1]).toContain("05-Mar-2024");
    });
  });
});

function rfq(id: number, over: Partial<Rfq> = {}): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 5000,
    direction: Direction.Buy,
    state: RfqState.Closed,
    expirySecs: 120,
    creationTimestamp: TS,
    ...over,
  };
}

function acceptedQuote(
  id: number,
  rfqId: number,
  over: Partial<Quote> = {},
): Quote {
  return {
    id,
    rfqId,
    dealerId: 2,
    state: { type: "accepted", price: 99 },
    ...over,
  };
}

function quoteMap(...quotes: Quote[]): ReadonlyMap<number, Quote> {
  return new Map(
    quotes.map((q) => {
      return [q.id, q];
    }),
  );
}
