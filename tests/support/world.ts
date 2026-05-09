import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PageObjects } from "../page-objects/contracts";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  po!: PageObjects;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.po = buildPlaywrightPageObjects(this.page);
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
