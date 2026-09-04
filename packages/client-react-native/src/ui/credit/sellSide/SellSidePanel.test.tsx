import { afterEach, expect, jest, test } from "@jest/globals";

import { Direction, type Quote, type Rfq, RfqState } from "@rtc/domain";

import {
  ADAPTIVE_BANK_ID,
  sellSidePanelPage,
} from "#tests/pages/SellSidePanelPage";

const page = sellSidePanelPage();

afterEach(() => {
  return page.unmountAll();
});

// THE §3.1 DECISION, ENCODED. The prototype shows one rotating ticket; the seam
// has many open at once. If this ever passes with a length of 1, the panel has
// quietly reverted to the prototype's information architecture.
test("renders a ticket per open rfq, not just the first", async () => {
  await page.mount({
    rfqs: [openRfq(5), openRfq(6), openRfq(7)],
    quoteFor: () => {
      return unpriced();
    },
  });

  expect(page.matchingCount(/^sell-side-ticket-/)).toBe(3);
});

// dc.html:305 — SUBMIT BID is a `linear-gradient(180deg, acc, acc2)` fill in
// every skin, painted by CtaGradient over the flat accent fallback.
test("the live ticket's SUBMIT CTA carries the accent ramp gradient", async () => {
  await page.mount({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return unpriced();
    },
  });
  expect(page.exists("cta-gradient")).toBe(true);
});

test("renders an empty state when nothing is open", async () => {
  await page.mount({
    rfqs: [],
    quoteFor: () => {
      return undefined;
    },
  });
  expect(page.exists("sell-side-empty")).toBe(true);
});

// The prototype puts the incoming ticket first and the settled quotes under a
// YOUR QUOTES heading (dc.html:292 then :305). Rendering in raw seam order
// buried a live ticket BELOW the history on device — backwards, since the
// ticket is the only thing on this screen with a countdown running on it.
test("puts live tickets above a YOUR QUOTES heading, settled rows below", async () => {
  await page.mount({
    rfqs: [settledRfq(5), openRfq(6)],
    quoteFor: (rfqId: number): Quote => {
      return rfqId === 5
        ? {
            id: 5,
            rfqId: 5,
            dealerId: ADAPTIVE_BANK_ID,
            state: { type: "accepted", price: 99.5 },
          }
        : unpriced();
    },
  });

  expect(page.exists("sell-side-your-quotes")).toBe(true);
  expect(page.exists("sell-side-submit-6")).toBe(true);
  expect(page.exists("sell-side-history-5")).toBe(true);
});

test("shows no YOUR QUOTES heading when nothing has settled", async () => {
  await page.mount({
    rfqs: [openRfq(6)],
    quoteFor: (): Quote => {
      return unpriced();
    },
  });

  expect(page.exists("sell-side-your-quotes")).toBe(false);
});

test("skips an rfq this desk was not asked to price", async () => {
  await page.mount({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return {
        id: 88,
        rfqId: 5,
        dealerId: 1,
        state: { type: "pendingWithoutPrice" },
      };
    },
  });

  expect(page.exists("sell-side-ticket-5")).toBe(false);
});

test("stepping the price and submitting sends the desk's own quote", async () => {
  const submitPrice = jest.fn<(quoteId: number, price: number) => void>();
  await page.mount({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return unpriced();
    },
    submitPrice,
  });

  // Seeded from the instrument's 98.4 reference price.
  await page.press("price-stepper-up");
  await page.press("sell-side-submit-5");

  expect(submitPrice).toHaveBeenCalledWith(88, 98.45);
});

test("a client Buy asks the desk for an OFFER, a client Sell for a BID", async () => {
  await page.mount({
    rfqs: [openRfq(5, Direction.Buy)],
    quoteFor: () => {
      return unpriced();
    },
  });
  expect(page.hasText("SUBMIT OFFER")).toBe(true);
  expect(page.hasTextMatching(/CLIENT BUYS/)).toBe(true);

  await page.mount({
    rfqs: [openRfq(5, Direction.Sell)],
    quoteFor: () => {
      return unpriced();
    },
  });
  expect(page.hasText("SUBMIT BID")).toBe(true);
  expect(page.hasTextMatching(/CLIENT SELLS/)).toBe(true);
});

// Won/lost comes from real QuoteState, NOT a 2600ms resolve timer (§3.1).
test("an accepted quote reads WON and a rejected one LOST", async () => {
  await page.mount({
    rfqs: [settledRfq(5), settledRfq(6)],
    quoteFor: (rfqId: number): Quote => {
      return {
        id: rfqId,
        rfqId,
        dealerId: ADAPTIVE_BANK_ID,
        state:
          rfqId === 5
            ? { type: "accepted", price: 99.5 }
            : { type: "rejectedWithPrice", price: 97.25 },
      };
    },
  });

  expect(page.hasTextContent("sell-side-status-5", "WON")).toBe(true);
  expect(page.hasTextContent("sell-side-status-6", "LOST")).toBe(true);
  expect(page.hasText("99.50")).toBe(true);
});

test("a priced-but-undecided quote leaves the ticket and reads PENDING", async () => {
  await page.mount({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return {
        id: 88,
        rfqId: 5,
        dealerId: ADAPTIVE_BANK_ID,
        state: { type: "pendingWithPrice", price: 98.45 },
      };
    },
  });

  expect(page.exists("sell-side-ticket-5")).toBe(false);
  expect(page.hasTextContent("sell-side-status-5", "PENDING")).toBe(true);
});

function unpriced(): Quote {
  return {
    id: 88,
    rfqId: 6,
    dealerId: ADAPTIVE_BANK_ID,
    state: { type: "pendingWithoutPrice" },
  };
}

function openRfq(id: number, direction: Direction = Direction.Buy): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function settledRfq(id: number): Rfq {
  return { ...openRfq(id), state: RfqState.Closed };
}
