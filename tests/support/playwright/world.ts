import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";
import { buildPlaywrightPageObjects } from "../../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  ctx!: TestContext;

  constructor(options: IWorldOptions) {
    super(options);
  }

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
