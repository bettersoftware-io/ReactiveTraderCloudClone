import { describe, expect, it } from "vitest";

import { Direction, type Quote, type Rfq, RfqState } from "@rtc/domain";

import { findBestQuoteId } from "#/ui/credit/rfqTiles/bestQuote";

const BUY_RFQ: Rfq = rfq(Direction.Buy);
const SELL_RFQ: Rfq = rfq(Direction.Sell);

describe("findBestQuoteId", () => {
  it("picks the LOWEST price for a Buy", () => {
    expect(findBestQuoteId(BUY_RFQ, [priced(10, 99), priced(11, 97)])).toBe(11);
  });

  it("picks the HIGHEST price for a Sell", () => {
    expect(findBestQuoteId(SELL_RFQ, [priced(10, 99), priced(11, 97)])).toBe(
      10,
    );
  });

  it("ignores quotes with no price", () => {
    expect(findBestQuoteId(BUY_RFQ, [unpriced(10), priced(11, 97)])).toBe(11);
  });

  it("ignores quotes that are no longer pending", () => {
    const accepted: Quote = {
      id: 12,
      rfqId: 1,
      dealerId: 7,
      state: { type: "accepted", price: 1 },
    };

    expect(findBestQuoteId(BUY_RFQ, [accepted, priced(11, 97)])).toBe(11);
  });

  it("returns null when nothing is priced", () => {
    expect(findBestQuoteId(BUY_RFQ, [unpriced(10)])).toBeNull();
  });

  it("returns null for no quotes at all", () => {
    expect(findBestQuoteId(BUY_RFQ, [])).toBeNull();
  });
});

function rfq(direction: Direction): Rfq {
  return {
    id: 1,
    instrumentId: 1,
    quantity: 25,
    direction,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function priced(id: number, price: number): Quote {
  return {
    id,
    rfqId: 1,
    dealerId: id,
    state: { type: "pendingWithPrice", price },
  };
}

function unpriced(id: number): Quote {
  return { id, rfqId: 1, dealerId: id, state: { type: "pendingWithoutPrice" } };
}
