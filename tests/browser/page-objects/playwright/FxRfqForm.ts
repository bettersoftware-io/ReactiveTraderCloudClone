import { expect, type Locator, type Page } from "@playwright/test";

import type { FxRfqFormPO } from "../contracts/FxRfqForm";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightFxRfqForm implements FxRfqFormPO {
  constructor(private readonly page: Page) {}

  private firstTile(): Locator {
    return this.page
      .locator(`[data-testid^='${TESTIDS.liveRates.tilePrefix}']`)
      .first();
  }

  private rfqButton(): Locator {
    return this.firstTile().getByText(/initiate rfq|request quote/i);
  }

  private countdownOrQuote(): Locator {
    return this.firstTile().getByText(/\d+s|accepting|expired|quote/i);
  }

  async waitForRfqButton(timeoutMs: number): Promise<void> {
    await expect(this.rfqButton()).toBeVisible({ timeout: timeoutMs });
  }

  async clickInitiateRfq(): Promise<void> {
    await this.rfqButton().click();
  }

  async waitForCountdownOrQuote(timeoutMs: number): Promise<void> {
    await expect(this.countdownOrQuote()).toBeVisible({ timeout: timeoutMs });
  }
}
