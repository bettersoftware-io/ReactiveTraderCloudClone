import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  E2E_SESSION_JSON,
  E2E_SESSION_KEY,
  JARVIS_NARRATOR_OFF_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "../authSeed";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

export class PlaywrightWorld extends World {
  context!: BrowserContext;

  page!: Page;

  ctx!: TestContext;

  async open(browser: Browser): Promise<void> {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    const baseURL = `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`;
    this.context = await browser.newContext({ baseURL });
    // Seed an authenticated session before ANY page script runs, on every
    // navigation in this context — AuthGate otherwise shows LoginScreen
    // instead of the app for every scenario. Harmless for the devtools
    // inspector SPA (a separate app, not gated by AuthGate) since it simply
    // ignores the unused localStorage key.
    await this.context.addInitScript(seedLocalStorageItem, {
      key: E2E_SESSION_KEY,
      value: E2E_SESSION_JSON,
    });
    // Seed JarvisNarrator OFF by default — the P5 narrator is preference-on
    // and reacts to real simulator anomaly episodes, so leaving it on the
    // default would make every scenario nondeterministic (see authSeed.ts).
    // The one ride that actually exercises narration opts back in for its own
    // context via PlaywrightWorkspace.openWithNarratorThresholds.
    await this.context.addInitScript(seedLocalStorageItem, {
      key: JARVIS_NARRATOR_STORAGE_KEY,
      value: JARVIS_NARRATOR_OFF_VALUE,
    });
    this.page = await this.context.newPage();
    this.ctx = {
      po: buildPlaywrightPageObjects(this.page),
      scratch: new Scratchpad(),
    };
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
