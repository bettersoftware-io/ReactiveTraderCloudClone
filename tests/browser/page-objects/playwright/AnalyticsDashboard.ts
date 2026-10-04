import { expect, type Locator, type Page } from "@playwright/test";

import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightAnalyticsDashboard implements AnalyticsDashboardPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

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
