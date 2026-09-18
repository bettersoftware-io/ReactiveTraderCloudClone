import { afterEach, expect, jest, test } from "@jest/globals";

import { logoutButtonPage } from "#tests/pages/LogoutButtonPage";

afterEach(() => {
  return page.unmountAll();
});

test("press signs the operator out", async () => {
  const logout = jest.fn();
  await page.mount(logout);
  await page.press();
  expect(logout).toHaveBeenCalledTimes(1);
});

const page = logoutButtonPage();
