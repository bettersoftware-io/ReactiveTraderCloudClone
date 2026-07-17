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

import { rfqCardVm } from "./rfqCardVm";

const instrument: Instrument = {
  id: 1,
  name: "US Treasury 10Y",
  cusip: "912828ZQ6",
  ticker: "T 1.5 02/34",
  maturity: "2034-02-15",
  interestRate: 1.5,
  benchmark: "10Y",
  refPrice: 98.4,
};

const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JPMorgan" },
];

describe("rfqCardVm", () => {
  it("resolves ticker/cusip/qty from the matching instrument", () => {
    const vm = rfqCardVm(rfq(), [], [instrument], dealers);
    expect(vm.ticker).toBe("T 1.5 02/34");
    expect(vm.cusip).toBe("912828ZQ6");
    expect(vm.qty).toBe("1,000");
  });

  it("falls back to empty ticker/cusip when the instrument is missing", () => {
    const vm = rfqCardVm(rfq({ instrumentId: 999 }), [], [instrument], dealers);
    expect(vm.ticker).toBe("");
    expect(vm.cusip).toBe("");
  });

  it.each([
    [RfqState.Open, "LIVE", "live"],
    [RfqState.Closed, "ACCEPTED", "accepted"],
    [RfqState.Cancelled, "CANCELLED", "terminated"],
    [RfqState.Expired, "EXPIRED", "terminated"],
  ] as const)("maps %s to stateLabel %s and cardState %s", (state, stateLabel, cardState) => {
    const vm = rfqCardVm(rfq({ state }), [], [instrument], dealers);
    expect(vm.stateLabel).toBe(stateLabel);
    expect(vm.cardState).toBe(cardState);
    expect(vm.live).toBe(state === RfqState.Open);
    expect(vm.accepted).toBe(state === RfqState.Closed);
    expect(vm.terminated).toBe(
      state === RfqState.Cancelled || state === RfqState.Expired,
    );
  });

  it("marks the min-priced quote best for a Buy RFQ", () => {
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
      {
        id: 12,
        rfqId: 1,
        dealerId: 3,
        state: { type: "pendingWithPrice", price: 98 },
      },
    ];
    const vm = rfqCardVm(
      rfq({ direction: Direction.Buy }),
      quotes,
      [instrument],
      dealers,
    );
    const best = vm.quotes.filter((q) => {
      return q.best;
    });
    expect(best).toHaveLength(1);
    expect(best[0]?.dealerId).toBe(2);
  });

  it("marks the max-priced quote best for a Sell RFQ", () => {
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
      {
        id: 12,
        rfqId: 1,
        dealerId: 3,
        state: { type: "pendingWithPrice", price: 101 },
      },
    ];
    const vm = rfqCardVm(
      rfq({ direction: Direction.Sell }),
      quotes,
      [instrument],
      dealers,
    );
    const best = vm.quotes.filter((q) => {
      return q.best;
    });
    expect(best).toHaveLength(1);
    expect(best[0]?.dealerId).toBe(3);
  });

  it("never marks a quote best once the RFQ is no longer live", () => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 2, state: { type: "accepted", price: 97 } },
    ];
    const vm = rfqCardVm(
      rfq({ state: RfqState.Closed }),
      quotes,
      [instrument],
      dealers,
    );
    expect(
      vm.quotes.every((q) => {
        return !q.best;
      }),
    ).toBe(true);
  });

  it("flags the Adaptive Bank quote row as house", () => {
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
        state: { type: "pendingWithPrice", price: 98 },
      },
    ];
    const vm = rfqCardVm(rfq(), quotes, [instrument], dealers);
    expect(
      vm.quotes.find((q) => {
        return q.dealerId === 1;
      })?.house,
    ).toBe(true);
    expect(
      vm.quotes.find((q) => {
        return q.dealerId === 2;
      })?.house,
    ).toBe(false);
  });

  it("only allows accept on a pendingWithPrice quote of a live RFQ", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 1,
        state: { type: "pendingWithPrice", price: 99 },
      },
      { id: 11, rfqId: 1, dealerId: 2, state: { type: "pendingWithoutPrice" } },
      { id: 12, rfqId: 1, dealerId: 3, state: { type: "passed" } },
    ];
    const vm = rfqCardVm(
      rfq({ state: RfqState.Open }),
      quotes,
      [instrument],
      dealers,
    );
    expect(
      vm.quotes.find((q) => {
        return q.quoteId === 10;
      })?.canAccept,
    ).toBe(true);
    expect(
      vm.quotes.find((q) => {
        return q.quoteId === 11;
      })?.canAccept,
    ).toBe(false);
    expect(
      vm.quotes.find((q) => {
        return q.quoteId === 12;
      })?.canAccept,
    ).toBe(false);
  });

  it("disallows accept once the RFQ itself is no longer live, even for a priced quote", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 1,
        state: { type: "pendingWithPrice", price: 99 },
      },
    ];
    const vm = rfqCardVm(
      rfq({ state: RfqState.Cancelled }),
      quotes,
      [instrument],
      dealers,
    );
    expect(vm.quotes[0]?.canAccept).toBe(false);
  });

  it.each([
    ["pendingWithoutPrice", "pending", "…"],
    ["passed", "passed", "Passed"],
    ["rejectedWithoutPrice", "rejected", "Rejected"],
  ] as const)("renders %s quote state as displayState=%s text=%s", (type, displayState, priceText) => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 1, state: { type } },
    ];
    const vm = rfqCardVm(rfq(), quotes, [instrument], dealers);
    expect(vm.quotes[0]?.state).toBe(displayState);
    expect(vm.quotes[0]?.priceText).toBe(priceText);
  });

  it.each([
    ["pendingWithPrice", "priced", "$97.50"],
    ["accepted", "accepted", "$97.50"],
    ["rejectedWithPrice", "rejected", "Rejected"],
  ] as const)("renders priced %s quote state as displayState=%s text=%s", (type, displayState, priceText) => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 1, state: { type, price: 97.5 } },
    ];
    const vm = rfqCardVm(rfq(), quotes, [instrument], dealers);
    expect(vm.quotes[0]?.state).toBe(displayState);
    expect(vm.quotes[0]?.priceText).toBe(priceText);
  });

  it("resolves the accepted dealer's name once Closed", () => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 3, state: { type: "accepted", price: 97 } },
      {
        id: 11,
        rfqId: 1,
        dealerId: 2,
        state: { type: "rejectedWithPrice", price: 98 },
      },
    ];
    const vm = rfqCardVm(
      rfq({ state: RfqState.Closed }),
      quotes,
      [instrument],
      dealers,
    );
    expect(vm.acceptedDealer).toBe("JPMorgan");
  });

  it("treats an unresolvable dealer id as non-house with an empty accepted name", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 999,
        state: { type: "accepted", price: 97 },
      },
    ];
    const vm = rfqCardVm(
      rfq({ state: RfqState.Closed }),
      quotes,
      [instrument],
      dealers,
    );
    expect(vm.quotes[0]?.house).toBe(false);
    expect(vm.quotes[0]?.bank).toBe("");
    expect(vm.acceptedDealer).toBe("");
  });

  it("has no accepted dealer when not Closed", () => {
    const vm = rfqCardVm(
      rfq({ state: RfqState.Open }),
      [],
      [instrument],
      dealers,
    );
    expect(vm.acceptedDealer).toBe("");
  });
});

function rfq(over: Partial<Rfq> = {}): Rfq {
  return {
    id: 1,
    instrumentId: 1,
    quantity: 1000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 1_700_000_000_000,
    ...over,
  };
}
