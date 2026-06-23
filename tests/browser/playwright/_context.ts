import { test as base, type Page } from "@playwright/test";

import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

interface TestFixtures {
  ctx: TestContext;
}

interface PlaywrightFixtureArgs {
  page: Page;
}

export const test = base.extend<TestFixtures>({
  ctx: async (
    { page }: PlaywrightFixtureArgs,
    use: (value: TestContext) => Promise<void>,
  ) => {
    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
    };
    await use(ctx);
  },
});
