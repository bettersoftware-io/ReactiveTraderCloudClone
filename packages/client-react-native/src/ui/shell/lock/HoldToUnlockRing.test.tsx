import { afterEach, expect, jest, test } from "@jest/globals";

import { holdToUnlockRingPage } from "#tests/pages/HoldToUnlockRingPage";

const page = holdToUnlockRingPage();

afterEach(() => {
  page.unmountAll();
});

test("renders the submit affordance under the lock-authenticate testID", async () => {
  await page.mount(0, jest.fn());
  expect(page.exists("lock-authenticate")).toBe(true);
  expect(page.labelText()).toBe("HOLD TO UNLOCK");
});

test("a plain tap on the ring calls onPress — the non-gesture fallback", async () => {
  const onPress = jest.fn();
  await page.mount(0, onPress);
  await page.press();
  expect(onPress).toHaveBeenCalledTimes(1);
});
