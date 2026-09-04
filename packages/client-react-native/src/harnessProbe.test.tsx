import { expect, test } from "@jest/globals";

import { harnessProbePage } from "#tests/pages/HarnessProbePage";

const page = harnessProbePage();

// RNTL 14 (React 19) made `render` async — it awaits a concurrent `act`.
test("RNTL renders an RN component and queries it", async () => {
  await page.mount("hello-rn-harness");
  expect(page.hasText("hello-rn-harness")).toBeTruthy();
});
