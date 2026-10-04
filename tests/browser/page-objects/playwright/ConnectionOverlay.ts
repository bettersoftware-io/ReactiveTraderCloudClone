import { expect, type Locator, type Page } from "@playwright/test";

import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightConnectionOverlay implements ConnectionOverlayPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private locator(): Locator {
    return this.page.getByTestId(TESTIDS.connection.overlay);
  }

  async isHidden(): Promise<boolean> {
    return await this.locator().isHidden();
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }

  async waitHidden(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeHidden({ timeout: timeoutMs });
  }

  async text(): Promise<string> {
    return (await this.locator().textContent()) ?? "";
  }

  async clearIncident(): Promise<void> {
    await this.page.getByTestId(TESTIDS.connection.clearIncident).click();
  }
}
