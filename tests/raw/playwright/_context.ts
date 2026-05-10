import { test as base } from "@playwright/test";
import type { TestContext } from "../../support/testContext";
import { Scratchpad } from "../../support/testContext";
import { buildPlaywrightPageObjects } from "../../page-objects/playwright/factory";

export const test = base.extend<{ ctx: TestContext }>({
  ctx: async ({ page }, use) => {
    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
    };
    await use(ctx);
  },
});

export { expect } from "@playwright/test";
