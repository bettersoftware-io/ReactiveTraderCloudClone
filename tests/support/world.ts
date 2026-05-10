import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PageObjects } from "../page-objects/contracts";
import type { TestContext } from "./testContext";
import { Scratchpad } from "./testContext";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  /** @deprecated Use `this.ctx.po`. Kept for migrating step files; removed in Task 8. */
  po!: PageObjects;
  ctx!: TestContext;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.po = buildPlaywrightPageObjects(this.page);
    this.ctx = { po: this.po, scratch: new Scratchpad() };
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
