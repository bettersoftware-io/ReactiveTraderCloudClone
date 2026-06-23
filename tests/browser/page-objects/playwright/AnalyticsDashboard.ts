import { expect, type Locator, type Page } from "@playwright/test";

import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightAnalyticsDashboard implements AnalyticsDashboardPO {
  constructor(private readonly page: Page) {}

  private locator(): Locator {
    return this.page.getByTestId(TESTIDS.analytics.panel);
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }

  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }

  async hasSection(name: string): Promise<boolean> {
    return await this.locator().getByText(name).isVisible();
  }
}
