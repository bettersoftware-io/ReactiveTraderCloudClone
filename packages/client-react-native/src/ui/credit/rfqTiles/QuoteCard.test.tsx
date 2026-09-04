import { afterEach, expect, jest, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { quoteCardPage } from "#tests/pages/QuoteCardPage";

const page = quoteCardPage();

afterEach(() => {
  return page.unmountAll();
});

test("shows the dealer name upper-cased and an unprefixed price", async () => {
  await page.mount({ state: { type: "pendingWithPrice", price: 99 } });
  expect(page.exists("quote-card-42")).toBe(true);
  // The design prints desks in caps (dc.html:243).
  expect(page.hasText("BANK A")).toBe(true);
  expect(page.hasText("99.00")).toBe(true);
});

// These are bond prices per 100 of par, and the design prints them bare
// (dc.html:2144). The `$` the first pass added was the deviation the Credit
// fidelity comparison named.
test("carries no currency prefix on the price", async () => {
  await page.mount({ state: { type: "pendingWithPrice", price: 99 } });
  expect(page.hasText("$99.00")).toBe(false);
});

test("marks the best quote with the design's BEST tag", async () => {
  await page.mount({
    state: { type: "pendingWithPrice", price: 99 },
    isBest: true,
  });
  expect(page.hasText("BANK A ◂ BEST")).toBe(true);
});

// `won` is the settled card's counterpart of `isBest`: the row that actually
// traded keeps the accent treatment once the race is over (dc.html:2151).
test("marks an accepted quote WON, not BEST", async () => {
  await page.mount({ state: { type: "accepted", price: 99 } });
  expect(page.hasText("BANK A ◂ WON")).toBe(true);
});

test("an ordinary quote carries no tag", async () => {
  await page.mount({ state: { type: "pendingWithPrice", price: 99 } });
  expect(page.hasTextMatching(/◂/)).toBe(false);
});

test("Accept fires onAccept with the quote id for a priced pending quote", async () => {
  const onAccept = jest.fn<(id: number) => void>();
  await page.mount({
    state: { type: "pendingWithPrice", price: 99 },
    acceptSlot: onAccept,
  });
  await page.press("quote-accept-42");
  expect(onAccept).toHaveBeenCalledWith(42);
});

test("no Accept button without a price; the dealer reads AWAITING instead", async () => {
  await page.mount({ state: { type: "pendingWithoutPrice" } });
  expect(page.exists("quote-accept-42")).toBe(false);
  expect(page.hasText("AWAITING")).toBe(true);
});

test("no Accept button without an onAccept slot", async () => {
  await page.mount({
    state: { type: "pendingWithPrice", price: 99 },
    acceptSlot: null,
  });
  expect(page.exists("quote-accept-42")).toBe(false);
});

test("the best quote haloes its ACCEPT button", async () => {
  await page.mount({
    state: { type: "pendingWithPrice", price: 99 },
    isBest: true,
  });
  expect(page.exists("accept-pulse")).toBe(true);
});

test("a non-best quote gets no halo", async () => {
  await page.mount({ state: { type: "pendingWithPrice", price: 99 } });
  expect(page.exists("accept-pulse")).toBe(false);
});

// dc.html:2152-2153 — only the best ACCEPT carries the accent → accent2 ramp;
// every other one is a flat `chip` tint.
test("only the best ACCEPT is filled with the gradient", async () => {
  await page.mount({
    state: { type: "pendingWithPrice", price: 99 },
    isBest: true,
  });
  expect(page.exists("cta-gradient")).toBe(true);
});

test("a non-best ACCEPT has no gradient fill", async () => {
  await page.mount({ state: { type: "pendingWithPrice", price: 99 } });
  expect(page.exists("cta-gradient")).toBe(false);
});

test("renders no gradient tile surface even on a 3d skin (dense row, not a hero tile)", async () => {
  await page.mount(
    { state: { type: "pendingWithPrice", price: 99 } },
    rnThemeTokens.holo3d.dark,
  );
  expect(page.exists("surface-sheen")).toBe(false);
});
