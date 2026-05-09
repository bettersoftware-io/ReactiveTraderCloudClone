import { type Page } from "@playwright/test";
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

  // Trade execution (filled in Task 8)
  async clickBuyOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickBuyOnFirst"); }
  async clickSellOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickSellOnFirst"); }
  async waitForConfirmation(_t: number): Promise<void> { throw notYet("LiveRatesTile.waitForConfirmation"); }
  async confirmationContainsAny(_p: readonly RegExp[], _t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationContainsAny"); }
  async dismissConfirmation(): Promise<void> { throw notYet("LiveRatesTile.dismissConfirmation"); }
  async confirmationHidden(_t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationHidden"); }
  async isConfirmationVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isConfirmationVisible"); }
  async fillFirstTileNotional(_v: string): Promise<void> { throw notYet("LiveRatesTile.fillFirstTileNotional"); }
  async isNotionalInputVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isNotionalInputVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
