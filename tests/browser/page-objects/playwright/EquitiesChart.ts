import { expect, type Locator, type Page } from "@playwright/test";

import type { EquitiesChartPO } from "../contracts/EquitiesChart";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightEquitiesChart implements EquitiesChartPO {
  constructor(private readonly page: Page) {}

  private plot(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.plot);
  }

  private backToLive(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.backToLive);
  }

  async waitPlotVisible(timeoutMs: number): Promise<void> {
    await expect(this.plot()).toBeVisible({ timeout: timeoutMs });
  }

  async focusPlot(): Promise<void> {
    await this.plot().click();
  }

  async pressArrowLeft(): Promise<void> {
    await this.plot().press("ArrowLeft");
  }

  async waitBackToLiveVisible(timeoutMs: number): Promise<void> {
    await expect(this.backToLive()).toBeVisible({ timeout: timeoutMs });
  }

  async waitBackToLiveHidden(timeoutMs: number): Promise<void> {
    await expect(this.backToLive()).toBeHidden({ timeout: timeoutMs });
  }

  async clickBackToLive(): Promise<void> {
    await this.backToLive().click();
  }

  async timeLabels(): Promise<string[]> {
    return await this.page
      .getByTestId(TESTIDS.equities.chart.timeLabel)
      .allTextContents();
  }
}
