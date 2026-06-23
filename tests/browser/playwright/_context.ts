import { test as base, type Page } from "@playwright/test";

import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

export const test = base.extend<{ ctx: TestContext }>({
  ctx: async (
    { page }: { page: Page },
    use: (value: TestContext) => Promise<void>,
  ) => {
    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
    };
    await use(ctx);
  },
});
