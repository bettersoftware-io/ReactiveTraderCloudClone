import { expect, test } from "@jest/globals";

import { rowInsertFlashPage } from "#tests/pages/UseRowInsertFlashPage";

const page = rowInsertFlashPage();

// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx). Reanimated is globally jest-mocked, so
// this can only assert mount/transition survival and that a style is
// returned — it cannot assert timing.
test("mounts and survives isNew and gating transitions", async () => {
  await page.mount(false, true);
  expect(page.hasText("row")).toBeTruthy();
  await page.rerender(true, true);
  await page.rerender(true, false);
  expect(page.hasText("row")).toBeTruthy();
});
