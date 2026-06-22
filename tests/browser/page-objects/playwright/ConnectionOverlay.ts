import { expect, type Page } from "@playwright/test";

import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightConnectionOverlay implements ConnectionOverlayPO {
  constructor(private readonly page: Page) {}
  private locator() {
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
}
