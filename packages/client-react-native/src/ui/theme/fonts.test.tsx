import { expect, test } from "@jest/globals";

import { appFontsPage } from "#tests/pages/UseAppFontsPage";

test("reports a boolean load state for the bundled fonts", async () => {
  // @testing-library/react-native's `renderHook` is async (returns a
  // Promise<RenderHookResult>), unlike the React DOM Testing Library.
  await page.mount();
  expect(typeof page.value).toBe("boolean");
  await page.unmountAll();
});

const page = appFontsPage();
