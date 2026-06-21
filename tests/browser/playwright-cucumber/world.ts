import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
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
