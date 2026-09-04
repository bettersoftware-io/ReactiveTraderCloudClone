import { expect, test } from "@jest/globals";

import { pnlValuePage } from "#tests/pages/PnlValuePage";

const page = pnlValuePage();

// The MOBILE prototype's headline (dc.html L975) is a grouped whole-dollar
// figure — "+$29,672" — not the web design's thousands shorthand. RN rendered
// the shared `formatPnlHeadline` ("+$9.7k"), which is right for the web
// clients and wrong here; `formatSignedDollars` is the mobile rule and lives
// beside this screen. The previous comment here cited "dc.html L1299", which
// is boot-canvas telemetry and never had anything to do with this format.

test("renders the headline as a grouped whole-dollar figure", async () => {
  await page.mount(29_672);
  expect(page.hasTextContent("pnl-value", "+$29,672")).toBe(true);
});

test("renders a loss with the design's U+2212 minus", async () => {
  await page.mount(-4000);
  expect(page.hasTextContent("pnl-value", "−$4,000")).toBe(true);
});

// The web renders the headline bare. Keeping RN's old "USD " prefix would read
// "USD +$29,672" once the dollar sign arrived with the new formatter.
test("carries no currency prefix — the format already includes the dollar sign", async () => {
  await page.mount(1000);
  expect(page.hasTextContent("pnl-value", "USD")).toBe(false);
});

test("carries no thousands shorthand — the whole figure is shown", async () => {
  await page.mount(5000);
  expect(page.hasTextContent("pnl-value", "+$5,000")).toBe(true);
});

test("treats zero as non-negative, matching the prototype's sign test", async () => {
  await page.mount(0);
  expect(page.hasTextContent("pnl-value", "+$0")).toBe(true);
});
