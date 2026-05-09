import { expect, type Page } from "@playwright/test";
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}

  private allTiles() {
    return this.page.locator(`[data-testid^='${TESTIDS.liveRates.tilePrefix}']`);
  }
  private firstTile() {
    return this.allTiles().first();
  }

  async waitForFirstTile(timeoutMs: number): Promise<void> {
    await this.firstTile().waitFor({ state: "visible", timeout: timeoutMs });
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
  async clickViewToggle(): Promise<void> {
    await this.page.getByTestId(TESTIDS.liveRates.viewToggle).click();
  }
  async viewToggleLabel(): Promise<string> {
    return (await this.page.getByTestId(TESTIDS.liveRates.viewToggle).textContent()) ?? "";
  }

  async firstTileBuyVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.buyBtn).isVisible();
  }
  async firstTileSellVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.sellBtn).isVisible();
  }
  async viewToggleVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.liveRates.viewToggle).isVisible();
  }

  async clickBuyOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.buyBtn).click();
  }
  async clickSellOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.sellBtn).click();
  }
  async waitForConfirmation(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeVisible({ timeout: timeoutMs });
  }
  async confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> {
    const confirmation = this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation);
    const combined = new RegExp(patterns.map((p) => p.source).join("|"), "i");
    await expect(confirmation).toContainText(combined, { timeout: timeoutMs });
  }
  async dismissConfirmation(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation).click();
  }
  async confirmationHidden(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeHidden({ timeout: timeoutMs });
  }
  async isConfirmationVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation).isVisible();
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
}
