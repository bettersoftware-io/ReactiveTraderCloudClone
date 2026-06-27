import { QuoteCard } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import type { Dealer, Quote, QuoteState } from "@rtc/domain";

const dealer: Dealer = { id: 7, name: "Citi" };

function quote(state: QuoteState, over: Partial<Quote> = {}): Quote {
  return {
    id: 100,
    rfqId: 1,
    dealerId: 7,
    state,
    ...over,
  };
}

describe("QuoteCard", () => {
  it("shows the dealer name and awaiting text before a price arrives", () => {
    const card = mount(QuoteCard, {
      props: { quote: quote({ type: "pendingWithoutPrice" }), dealer },
    });
    expect(card.dealerLabel()).toBe("Citi");
    expect(card.valueText()).toMatch(/awaiting response/i);
    expect(card.canAccept()).toBe(false);
  });

  it("falls back to a generic dealer label when no dealer is supplied", () => {
    const card = mount(QuoteCard, {
      props: {
        quote: quote({ type: "rejectedWithoutPrice" }),
        dealer: undefined,
      },
    });
    expect(card.dealerLabel()).toBe("Dealer 7");
    expect(card.valueText()).toMatch(/awaiting response/i);
  });

  it("shows the price for a priced quote and an Accept button when accept is allowed", () => {
    const card = mount(QuoteCard, {
      props: {
        quote: quote({ type: "pendingWithPrice", price: 99 }),
        dealer,
        onAccept: () => {},
      },
    });
    expect(card.valueText()).toBe("$99");
    expect(card.canAccept()).toBe(true);
  });

  it("does not offer Accept for a priced quote when no onAccept handler is given", () => {
    const card = mount(QuoteCard, {
      props: { quote: quote({ type: "pendingWithPrice", price: 99 }), dealer },
    });
    expect(card.canAccept()).toBe(false);
  });

  it("fires onAccept with the quote id when Accept is clicked", async () => {
    const accepted: number[] = [];
    const card = mount(QuoteCard, {
      props: {
        quote: quote({ type: "pendingWithPrice", price: 99 }, { id: 321 }),
        dealer,
        onAccept: (id: number) => {
          return accepted.push(id);
        },
      },
    });
    await card.accept();
    expect(accepted).toEqual([321]);
  });

  it("shows the accepted price without an Accept button", () => {
    const card = mount(QuoteCard, {
      props: {
        quote: quote({ type: "accepted", price: 101 }),
        dealer,
        onAccept: () => {},
      },
    });
    expect(card.valueText()).toBe("$101");
    expect(card.canAccept()).toBe(false);
  });

  it("shows the rejected price text", () => {
    const card = mount(QuoteCard, {
      props: { quote: quote({ type: "rejectedWithPrice", price: 88 }), dealer },
    });
    expect(card.valueText()).toBe("$88");
  });

  it("shows Passed for a passed quote", () => {
    const card = mount(QuoteCard, {
      props: { quote: quote({ type: "passed" }), dealer },
    });
    expect(card.valueText()).toBe("Passed");
  });

  it("updates the displayed state when the quote prop changes", () => {
    const card = mount(QuoteCard, {
      props: {
        quote: quote({ type: "pendingWithoutPrice" }),
        dealer,
        onAccept: () => {},
      },
    });
    expect(card.valueText()).toMatch(/awaiting response/i);
    card.setProps({ quote: quote({ type: "pendingWithPrice", price: 95 }) });
    expect(card.valueText()).toBe("$95");
    expect(card.canAccept()).toBe(true);
  });
});
