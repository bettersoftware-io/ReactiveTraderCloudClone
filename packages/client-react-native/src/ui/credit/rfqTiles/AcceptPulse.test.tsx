import { afterEach, expect, test } from "@jest/globals";

import { acceptPulsePage } from "#tests/pages/AcceptPulsePage";

const page = acceptPulsePage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the ripple when motion is enabled", async () => {
  await page.mount(false);
  expect(page.exists("accept-pulse")).toBe(true);
});

test("renders nothing when motion is disabled", async () => {
  await page.mount(true);
  expect(page.exists("accept-pulse")).toBe(false);
  expect(page.isEmpty()).toBe(true);
});
