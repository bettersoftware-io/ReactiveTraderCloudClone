import { type BrowserContext, test as base, type Page } from "@playwright/test";

import {
  E2E_SESSION_JSON,
  E2E_SESSION_KEY,
  seedSessionLocalStorage,
} from "../authSeed";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

interface TestFixtures {
  ctx: TestContext;
}

interface PlaywrightFixtureArgs {
  page: Page;
}

interface ContextFixtureArgs {
  context: BrowserContext;
}

export const test = base.extend<TestFixtures>({
  // Override the built-in `context` fixture (which `page` is built from) so
  // EVERY spec in this suite seeds an authenticated session before any page
  // script runs — AuthGate otherwise shows LoginScreen instead of the app.
  // Harmless for the devtools inspector SPA (devtools.spec.ts's second page,
  // same context): it's a separate app that ignores the unused key.
  context: async (
    { context }: ContextFixtureArgs,
    use: (value: BrowserContext) => Promise<void>,
  ) => {
    await context.addInitScript(seedSessionLocalStorage, {
      key: E2E_SESSION_KEY,
      value: E2E_SESSION_JSON,
    });
    await use(context);
  },
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
