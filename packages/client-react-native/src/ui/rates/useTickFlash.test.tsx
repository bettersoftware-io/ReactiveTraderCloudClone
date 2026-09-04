import { expect, test } from "@jest/globals";

import { tickFlashPage } from "#tests/pages/UseTickFlashPage";

const page = tickFlashPage();

// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx).
test("mounts and survives value changes and gating", async () => {
  await page.mount(1.085, true);
  expect(page.hasText("flash")).toBeTruthy();
  await page.rerender(1.086, true);
  await page.rerender(1.086, false);
  expect(page.hasText("flash")).toBeTruthy();
  await page.unmountAll();
});
