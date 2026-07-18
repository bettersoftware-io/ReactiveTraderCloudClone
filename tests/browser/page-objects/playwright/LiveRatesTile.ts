import { expect, type Locator, type Page } from "@playwright/test";

import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}

  private allTiles(): Locator {
    return this.page.locator(
      `[data-testid^='${TESTIDS.liveRates.tilePrefix}']`,
    );
  }

  private firstTile(): Locator {
    return this.allTiles().first();
  }

  async waitForFirstTile(timeoutMs: number): Promise<void> {
    await expect(this.firstTile()).toBeVisible({ timeout: timeoutMs });
  }

  async count(): Promise<number> {
    return await this.allTiles().count();
  }

  async firstTileText(): Promise<string> {
    return await this.firstTile().innerText();
  }

  async clickFilter(category: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.liveRates.filter(category)).click();
  }

  async clickChartsToggle(): Promise<void> {
    await this.page.getByTestId(TESTIDS.liveRates.chartsToggle).click();
  }

  async chartsToggleActive(): Promise<boolean> {
    return (
      (await this.page
        .getByTestId(TESTIDS.liveRates.chartsToggle)
        .getAttribute("data-active")) === "true"
    );
  }

  async chartsToggleVisible(): Promise<boolean> {
    return await this.page
      .getByTestId(TESTIDS.liveRates.chartsToggle)
      .isVisible();
  }

  async firstTileBuyVisible(): Promise<boolean> {
    return await this.firstTile()
      .getByTestId(TESTIDS.liveRates.buyBtn)
      .isVisible();
  }

  async firstTileSellVisible(): Promise<boolean> {
    return await this.firstTile()
      .getByTestId(TESTIDS.liveRates.sellBtn)
      .isVisible();
  }

  async firstTileChartVisible(): Promise<boolean> {
    return await this.firstTile()
      .getByTestId(TESTIDS.liveRates.tileChart)
      .isVisible();
  }

  async clickBuyOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.buyBtn).click();
  }

  async clickSellOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.sellBtn).click();
  }

  async clickBuyOnPair(symbol: string): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.liveRates.tile(symbol))
      .getByTestId(TESTIDS.liveRates.buyBtn)
      .click();
  }

  async waitForConfirmation(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async confirmationContainsAny(
    patterns: readonly RegExp[],
    timeoutMs: number,
  ): Promise<void> {
    const confirmation = this.firstTile().getByTestId(
      TESTIDS.liveRates.tradeConfirmation,
    );

    const combined = new RegExp(
      patterns
        .map((p) => {
          return p.source;
        })
        .join("|"),
      "i",
    );
    await expect(confirmation).toContainText(combined, { timeout: timeoutMs });
  }

  async dismissConfirmation(): Promise<void> {
    const confirmation = this.firstTile().getByTestId(
      TESTIDS.liveRates.tradeConfirmation,
    );
    // A DONE confirmation is a card whose only dismiss affordance is its
    // DISMISS chip (the overlay div has no click handler); every other
    // terminal state renders the whole overlay as a click-anywhere button.
    // Clicking the right target makes dismissal deterministic — previously
    // this clicked the inert card and the test only passed when the 5s
    // auto-dismiss timer beat the 5s hide assertion, a race the app now
    // loses since the perf rounds made the pre-assertion steps near-instant.
    const dismissChip = confirmation.locator('[data-action="dismiss"]');

    if ((await dismissChip.count()) > 0) {
      await dismissChip.click();
    } else {
      await confirmation.click();
    }
  }

  async confirmationHidden(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeHidden({ timeout: timeoutMs });
  }

  async isConfirmationVisible(): Promise<boolean> {
    return await this.firstTile()
      .getByTestId(TESTIDS.liveRates.tradeConfirmation)
      .isVisible();
  }

  async fillFirstTileNotional(value: string): Promise<void> {
    const input = this.firstTile().locator("input");
    await input.click();
    await input.fill(value);
    await input.press("Enter");
  }

  async isNotionalInputVisible(): Promise<boolean> {
    return await this.firstTile().locator("input").isVisible();
  }

  async buyNTimesWithDismissals(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await this.clickBuyOnFirst();
      await this.page.waitForTimeout(1_500);

      if (await this.isConfirmationVisible()) {
        await this.dismissConfirmation();
        await this.page.waitForTimeout(500);
      }
    }
  }
}
