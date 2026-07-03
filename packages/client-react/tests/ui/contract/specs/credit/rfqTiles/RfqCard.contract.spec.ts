import { RfqCard } from "@ui-contract/components";
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

const instrument: Instrument = {
  id: 2,
  name: "Apple Inc 2030",
  cusip: "037833EK8",
  ticker: "AAPL 2.4 30",
  maturity: "2030-05-11",
  interestRate: 2.4,
  benchmark: "7Y",
  refPrice: 99.8,
};
const dealers: readonly Dealer[] = [
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
];

describe("RfqCard", () => {
  it("shows the instrument name, direction and quantity", () => {
    const card = mount(RfqCard, {
      props: {
        rfq: rfq(),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(card.title()).toBe("Apple Inc 2030");
    expect(card.hasText(/Buy/)).toBe(true);
    expect(card.hasText(/5,000/)).toBe(true);
  });

  it("falls back to an instrument-id label when the instrument is unknown", () => {
    const card = mount(RfqCard, {
      props: {
        rfq: rfq(),
        quotes: [],
        instrument: undefined,
        dealers,
        onAccept: () => {},
      },
    });
    expect(card.title()).toBe("Instrument #2");
  });

  it("labels each RFQ state and only allows dismiss when not open", () => {
    const live = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Open }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
        onDismiss: () => {},
      },
    });
    expect(live.stateBadge()).toBe("Live");
    expect(live.canDismiss()).toBe(false);

    const done = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
        onDismiss: () => {},
      },
    });
    expect(done.stateBadge()).toBe("Done");
    expect(done.canDismiss()).toBe(true);

    const expired = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Expired }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
        onDismiss: () => {},
      },
    });
    expect(expired.stateBadge()).toBe("Expired");

    const cancelled = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Cancelled }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
        onDismiss: () => {},
      },
    });
    expect(cancelled.stateBadge()).toBe("Cancelled");
  });

  it("hides the dismiss control on a closed RFQ when no onDismiss handler is given", () => {
    const card = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(card.canDismiss()).toBe(false);
  });

  it("fires onDismiss with the rfq id when the dismiss control is clicked", async () => {
    const dismissed: number[] = [];
    const card = mount(RfqCard, {
      props: {
        rfq: rfq({ id: 77, state: RfqState.Closed }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
        onDismiss: (id: number) => {
          return dismissed.push(id);
        },
      },
    });
    await card.dismiss();
    expect(dismissed).toEqual([77]);
  });

  it("renders quotes with their dealer names and accepts on an open RFQ", async () => {
    const accepted: number[] = [];
    const card = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Open }),
        quotes: [quote({ id: 901, dealerId: 2 })],
        instrument,
        dealers,
        onAccept: (id: number) => {
          return accepted.push(id);
        },
      },
    });
    expect(card.hasText("Citi")).toBe(true);
    expect(card.hasText("$99")).toBe(true);
    await card.acceptFirst();
    expect(accepted).toEqual([901]);
  });

  it("does not offer Accept when the RFQ is closed", () => {
    const card = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quotes: [quote()],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(card.quoteCount()).toBe(0);
  });

  it("re-renders when new quotes arrive via props", () => {
    const card = mount(RfqCard, {
      props: {
        rfq: rfq(),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(card.hasText("$99")).toBe(false);
    card.setProps({ quotes: [quote()] });
    expect(card.hasText("$99")).toBe(true);
  });

  it("shows a live countdown only on an Open RFQ, not on Closed/Expired/Cancelled", () => {
    const openCard = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Open }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(openCard.hasCountdown()).toBe(true);

    const closedCard = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Closed }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(closedCard.hasCountdown()).toBe(false);

    const expiredCard = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Expired }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(expiredCard.hasCountdown()).toBe(false);

    const cancelledCard = mount(RfqCard, {
      props: {
        rfq: rfq({ state: RfqState.Cancelled }),
        quotes: [],
        instrument,
        dealers,
        onAccept: () => {},
      },
    });
    expect(cancelledCard.hasCountdown()).toBe(false);
  });
});

function rfq(over: Partial<Rfq> = {}): Rfq {
  return {
    id: 50,
    instrumentId: 2,
    quantity: 5000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 1_700_000_000_000,
    ...over,
  };
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: 900,
    rfqId: 50,
    dealerId: 2,
    state: { type: "pendingWithPrice", price: 99 },
    ...over,
  };
}
