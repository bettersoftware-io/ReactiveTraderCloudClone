import { afterEach, expect, jest, test } from "@jest/globals";

import { appearanceButtonPage } from "#tests/pages/AppearanceButtonPage";

const page = appearanceButtonPage();

afterEach(() => {
  return page.unmountAll();
});

test("invokes onPress when tapped", async () => {
  const onPress = jest.fn();
  await page.mount(onPress);
  await page.press();
  expect(onPress).toHaveBeenCalledTimes(1);
});
