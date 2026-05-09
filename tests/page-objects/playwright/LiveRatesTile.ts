import type { Page } from "@playwright/test";
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}
  async waitForFirstTile(timeoutMs: number): Promise<void> {
    await this.page
      .locator(`[data-testid^='${TESTIDS.liveRates.tilePrefix}']`)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
  count(): Promise<number> { throw notYet("LiveRatesTile.count"); }
  firstTileText(): Promise<string> { throw notYet("LiveRatesTile.firstTileText"); }
  clickFilter(_c: string): Promise<void> { throw notYet("LiveRatesTile.clickFilter"); }
  clickViewToggle(): Promise<void> { throw notYet("LiveRatesTile.clickViewToggle"); }
  viewToggleLabel(): Promise<string> { throw notYet("LiveRatesTile.viewToggleLabel"); }
  clickBuyOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickBuyOnFirst"); }
  clickSellOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickSellOnFirst"); }
  waitForConfirmation(_t: number): Promise<void> { throw notYet("LiveRatesTile.waitForConfirmation"); }
  confirmationContainsAny(_p: readonly RegExp[], _t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationContainsAny"); }
  dismissConfirmation(): Promise<void> { throw notYet("LiveRatesTile.dismissConfirmation"); }
  confirmationHidden(_t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationHidden"); }
  isConfirmationVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isConfirmationVisible"); }
  fillFirstTileNotional(_v: string): Promise<void> { throw notYet("LiveRatesTile.fillFirstTileNotional"); }
  isNotionalInputVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isNotionalInputVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
