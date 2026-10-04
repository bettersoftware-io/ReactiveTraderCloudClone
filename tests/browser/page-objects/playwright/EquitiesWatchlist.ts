import { expect, type Locator, type Page } from "@playwright/test";

import type { EquitiesWatchlistPO } from "../contracts/EquitiesWatchlist.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightEquitiesWatchlist implements EquitiesWatchlistPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

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
