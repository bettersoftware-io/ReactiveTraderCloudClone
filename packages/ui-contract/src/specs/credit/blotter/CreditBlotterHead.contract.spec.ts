import { CreditBlotterHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
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

describe("CreditBlotterHead", () => {
  it("renders the icon+label tab title", () => {
    const page = mount(CreditBlotterHead);
    expect(page.titleText()).toBe("▤ Credit Blotter");
  });

  it("always renders active (the panel has only one view, so it never toggles)", () => {
    const page = mount(CreditBlotterHead);
    expect(page.isActive()).toBe(true);
  });

  // The blotter chrome lives in the head now (mirrors FxBlotterHead): count +
  // quick filter + CSV chip after the spacer. The head↔body seam behaviour is
  // exercised in CreditBlotter.contract.spec.ts via CreditBlotterWorkspace.
  it("shows the unfiltered trade count derived off the ViewModel", () => {
    const page = mount(CreditBlotterHead, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1), rfq(2)],
        useAllQuotes: quoteMap(acceptedQuote(900, 1), acceptedQuote(901, 2)),
      },
    });
    expect(page.tradeCountText()).toBe("2 trades");
  });

  it("renders the quick-filter input and the ⤓ CSV chip", () => {
    const page = mount(CreditBlotterHead);
    expect(page.hasQuickFilter()).toBe(true);
    expect(page.csvChipLabel()).toBe("⤓ CSV");
  });
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
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
];

function rfq(id: number, over: Partial<Rfq> = {}): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 5000,
    direction: Direction.Buy,
    state: RfqState.Closed,
    expirySecs: 120,
    creationTimestamp: Date.UTC(2024, 2, 5, 12, 0, 0),
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
