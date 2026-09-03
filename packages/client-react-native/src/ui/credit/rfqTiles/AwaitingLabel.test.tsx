import { afterEach, expect, test } from "@jest/globals";

import { awaitingLabelPage } from "#tests/pages/AwaitingLabelPage";

const page = awaitingLabelPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the AWAITING copy", async () => {
  await page.mount(false);
  expect(page.hasText("AWAITING")).toBe(true);
});

test("keeps the ellipsis visible with motion gated off", async () => {
  await page.mount(true);
  expect(page.exists("awaiting-ellipsis")).toBe(true);
});
