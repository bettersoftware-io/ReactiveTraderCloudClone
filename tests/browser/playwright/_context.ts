import { type BrowserContext, test as base, type Page } from "@playwright/test";

import {
  E2E_SESSION_JSON,
  E2E_SESSION_KEY,
  JARVIS_NARRATOR_OFF_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "../authSeed.ts";
import {
  FIRST_DOCK_RENDER_ARM_KEY,
  installFirstDockRenderRecorder,
} from "../firstDockRenderRecorder.ts";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory.ts";
import type { TestContext } from "../testContext.ts";
import { Scratchpad } from "../testContext.ts";

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
    await context.addInitScript(seedLocalStorageItem, {
      key: E2E_SESSION_KEY,
      value: E2E_SESSION_JSON,
    });
    // Seed JarvisNarrator OFF by default — the P5 narrator is preference-on
    // and reacts to real simulator anomaly episodes, so leaving it on the
    // default would make every scenario nondeterministic (see authSeed.ts).
    // The one ride that actually exercises narration opts back in for its own
    // context via PlaywrightWorkspace.openWithNarratorThresholds.
    await context.addInitScript(seedLocalStorageItem, {
      key: JARVIS_NARRATOR_STORAGE_KEY,
      value: JARVIS_NARRATOR_OFF_VALUE,
    });
    // Inert until a scenario arms it (PlaywrightLayout.recordFirstDockRender);
    // registered here, not just before the reload it observes, so no
    // registration races the navigation (see firstDockRenderRecorder.ts).
    await context.addInitScript(installFirstDockRenderRecorder, {
      armKey: FIRST_DOCK_RENDER_ARM_KEY,
    });
    await use(context);
  },
  ctx: async (
    { page }: PlaywrightFixtureArgs,
    use: (value: TestContext) => Promise<void>,
  ) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
      pageErrors,
    };
    await use(ctx);
  },
});
