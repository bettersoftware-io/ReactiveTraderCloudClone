import { afterEach, expect, test } from "@jest/globals";

import { rfqCountdownRingPage } from "#tests/pages/RfqCountdownRingPage";

const page = rfqCountdownRingPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders a ring for a live RFQ", async () => {
  await page.mount(30_000);
  expect(page.exists("rfq-countdown-ring")).toBe(true);
});

test("still renders at zero remaining rather than unmounting", async () => {
  await page.mount(0);
  expect(page.exists("rfq-countdown-ring")).toBe(true);
});

test("shows the remaining whole seconds in the ring's centre", async () => {
  await page.mount(30_000);
  expect(page.hasText("30")).toBe(true);
});

test("clamps a negative remaining to a zero readout", async () => {
  await page.mount(-500);
  expect(page.hasText("0")).toBe(true);
});
