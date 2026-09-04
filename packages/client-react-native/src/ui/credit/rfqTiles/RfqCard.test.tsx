import { afterEach, expect, test } from "@jest/globals";

import type { Quote } from "@rtc/domain";
import { Direction, type Rfq, RfqState } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { rfqCardPage } from "#tests/pages/RfqCardPage";

const page = rfqCardPage();

afterEach(() => {
  return page.unmountAll();
});

// dc.html:233 — `BUY · 1.0M USD · #3045`: the side in caps and coloured, then
// the abbreviated notional and the RFQ id, all separated by middots. The app
// printed `Buy | Qty: 25` here until 2026-08-30.
test("shows the instrument and the design's BUY · notional · #id subtitle", async () => {
  await page.mount(rfq(RfqState.Open), []);
  expect(page.exists("rfq-card-3")).toBe(true);
  expect(page.hasText("Acme 5.5% 2030")).toBe(true);
  expect(page.hasTextContent("rfq-meta-3", "BUY · 25 USD · #3")).toBe(true);
});

test("upper-cases a Sell side too", async () => {
  await page.mount({ ...rfq(RfqState.Open), direction: Direction.Sell }, []);
  expect(page.hasTextContent("rfq-meta-3", "SELL · 25 USD · #3")).toBe(true);
});

// The prototype only ever seeds whole millions, so `toFixed(1)` alone is the
// whole rule there; the app has to survive the smaller RFQs the domain can
// produce without abbreviating them to `0.0M USD`.
test("abbreviates the notional the way the design does", async () => {
  await page.mount({ ...rfq(RfqState.Open), quantity: 5_000_000 }, []);
  expect(page.hasTextContent("rfq-meta-3", "BUY · 5.0M USD · #3")).toBe(true);
});

test("falls back to thousands below a million rather than 0.0M", async () => {
  await page.mount({ ...rfq(RfqState.Open), quantity: 250_000 }, []);
  expect(page.hasTextContent("rfq-meta-3", "BUY · 250K USD · #3")).toBe(true);
});

// The prototype's header slot is exclusive: a live RFQ shows the countdown
// ring, a closed one shows the state pill (dc.html:228-237). A live card needs
// no "Live" badge — the running ring already says so.
test("an open RFQ shows the countdown ring in place of a state badge", async () => {
  await page.mount(rfq(RfqState.Open), []);
  expect(page.exists("rfq-countdown-ring")).toBe(true);
  expect(page.exists("rfq-badge-3")).toBe(false);
});

// "Accepted" is not an `RfqState` member: the domain models a traded RFQ as
// `Closed` (the web client's `rfqCardVm` derives `accepted` the same way).
test("stamps a traded rfq in the header slot, not below the quote rows", async () => {
  await page.mount(rfq(RfqState.Closed), []);
  // The prototype's header slot is exclusive: a countdown ring while live, one
  // animated state pill once settled (dc.html:238). We used to render BOTH a
  // static `Done` here AND a boxed `ACCEPTED` banner under the rows — two
  // elements for one fact, spending a row of the scarcest resource on a phone.
  expect(page.hasTextContent("rfq-badge-3", "✓ ACCEPTED")).toBe(true);
  // Exactly one element says it. `getBy*` throws on multiple matches, so this
  // is the assertion that actually pins the merge — a second banner would fail
  // here even if the header pill were correct.
  expect(page.hasText("✓ ACCEPTED")).toBe(true);
});

test("does not render the stamp while the rfq is live", async () => {
  await page.mount(rfq(RfqState.Open), []);
  expect(page.hasText("✓ ACCEPTED")).toBe(false);
  // A live card's header holds the ring instead — the slot is one-or-the-other.
  expect(page.exists("rfq-countdown-ring")).toBe(true);
});

test("an expired rfq gets the neutral pill, never the accepted one", async () => {
  await page.mount(rfq(RfqState.Expired), []);
  expect(page.hasText("✓ ACCEPTED")).toBe(false);
  expect(page.hasTextContent("rfq-badge-3", "Expired")).toBe(true);
});

test("a closed RFQ shows the state badge and a dismiss button, no ring", async () => {
  await page.mount(rfq(RfqState.Closed), []);
  expect(page.exists("rfq-countdown-ring")).toBe(false);
  expect(page.hasTextContent("rfq-badge-3", "✓ ACCEPTED")).toBe(true);
  expect(page.exists("rfq-dismiss-3")).toBe(true);
});

test("renders a quote per quote", async () => {
  const quotes: Quote[] = [
    {
      id: 42,
      rfqId: 3,
      dealerId: 7,
      state: { type: "pendingWithPrice", price: 99 },
    },
  ];
  await page.mount(rfq(RfqState.Open), quotes);
  expect(page.exists("quote-accept-42")).toBe(true);
});

test("renders a gradient tile surface on 3d skins", async () => {
  await page.mount(rfq(RfqState.Open), [], rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(true);
});

test("flat skins render no gradient tile surface", async () => {
  // page.mount defaults to holo.dark (a flat skin, depth.level 0).
  await page.mount(rfq(RfqState.Open), []);
  expect(page.exists("surface-sheen")).toBe(false);
});

function rfq(state: RfqState): Rfq {
  return {
    id: 3,
    instrumentId: 1,
    quantity: 25,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}
