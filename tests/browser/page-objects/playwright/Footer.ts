import type { Page } from "@playwright/test";

import type { FooterPO } from "../contracts/Footer";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightFooter implements FooterPO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.connection.status);
  }
  async connectionLabel(): Promise<string> {
    return (await this.locator().textContent()) ?? "";
  }
  async isStatusVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
}
