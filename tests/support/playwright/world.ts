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
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
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
