import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";

function notYet(name: string): never {
  throw new Error(`CypressLiveRatesTile.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressLiveRatesTile implements LiveRatesTilePO {
  waitForFirstTile(timeoutMs: number): Promise<void> { notYet("waitForFirstTile"); }
  count(): Promise<number> { notYet("count"); }
  firstTileText(): Promise<string> { notYet("firstTileText"); }
  clickFilter(category: string): Promise<void> { notYet("clickFilter"); }
  clickViewToggle(): Promise<void> { notYet("clickViewToggle"); }
  viewToggleLabel(): Promise<string> { notYet("viewToggleLabel"); }
  firstTileBuyVisible(): Promise<boolean> { notYet("firstTileBuyVisible"); }
  firstTileSellVisible(): Promise<boolean> { notYet("firstTileSellVisible"); }
  viewToggleVisible(): Promise<boolean> { notYet("viewToggleVisible"); }
  clickBuyOnFirst(): Promise<void> { notYet("clickBuyOnFirst"); }
  clickSellOnFirst(): Promise<void> { notYet("clickSellOnFirst"); }
  waitForConfirmation(timeoutMs: number): Promise<void> { notYet("waitForConfirmation"); }
  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> { notYet("confirmationContainsAny"); }
  dismissConfirmation(): Promise<void> { notYet("dismissConfirmation"); }
  confirmationHidden(timeoutMs: number): Promise<void> { notYet("confirmationHidden"); }
  isConfirmationVisible(): Promise<boolean> { notYet("isConfirmationVisible"); }
  fillFirstTileNotional(value: string): Promise<void> { notYet("fillFirstTileNotional"); }
  isNotionalInputVisible(): Promise<boolean> { notYet("isNotionalInputVisible"); }
}
