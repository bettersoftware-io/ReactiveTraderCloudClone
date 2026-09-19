import { afterEach, expect, jest, test } from "@jest/globals";

import { lockButtonPage } from "#tests/pages/LockButtonPage";

afterEach(() => {
  return page.unmountAll();
});

test("press locks the session", async () => {
  const lock = jest.fn();
  await page.mount(lock);
  await page.press();
  expect(lock).toHaveBeenCalledTimes(1);
});

const page = lockButtonPage();
