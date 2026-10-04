import type { Locator, Page } from "@playwright/test";

import type { FooterPO } from "../contracts/Footer.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightFooter implements FooterPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private locator(): Locator {
    return this.page.getByTestId(TESTIDS.connection.status);
  }

  async connectionLabel(): Promise<string> {
    return (await this.locator().textContent()) ?? "";
  }

  async isStatusVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
}
