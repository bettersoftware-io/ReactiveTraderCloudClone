import { expect, type Locator, type Page } from "@playwright/test";

import type { EquitiesWatchlistPO } from "../contracts/EquitiesWatchlist";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightEquitiesWatchlist implements EquitiesWatchlistPO {
  constructor(private readonly page: Page) {}

  private firstRow(): Locator {
    return this.page
      .locator(`[data-testid^='${TESTIDS.equities.watchlist.rowPrefix}']`)
      .first();
  }

  async waitForFirstRowLiveQuote(timeoutMs: number): Promise<void> {
    await expect(this.firstRow()).toBeVisible({ timeout: timeoutMs });
    await expect(this.firstRow()).toContainText(/\d+\.\d+/, {
      timeout: timeoutMs,
    });
  }
}
