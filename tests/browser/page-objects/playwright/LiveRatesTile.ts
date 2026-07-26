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
    await this.dismissConfirmationIn(this.firstTile());
  }

  async confirmationHidden(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeHidden({ timeout: timeoutMs });
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

  async dismissConfirmationOnceSettled(): Promise<void> {
    await this.settleAndDismiss(this.firstTile());
  }

  async dismissPairConfirmationOnceSettled(symbol: string): Promise<void> {
    await this.settleAndDismiss(
      this.page.getByTestId(TESTIDS.liveRates.tile(symbol)),
    );
  }

  // Waiting for the trade to SETTLE — rather than sleeping past its delay — is
  // what makes a buy loop deterministic. ExecutionSimulator settles a normal
  // pair after Math.random() * 2000 ms, so any fixed sleep under 2 s loses the
  // race a share of the time; this loop used to sleep 1.5 s and lost it ~25% of
  // the time per buy. Losing it was silently destructive rather than merely
  // slow: the in-flight EXECUTING… overlay carries the same `trade-confirmation`
  // testid as the terminal card, so the visibility check passed and the dismiss
  // click landed on an overlay that is an inert <div> until the trade settles
  // (only terminal states render a DISMISS chip or a click-anywhere button).
  // The overlay therefore stayed up until the app's own 5 s auto-dismiss
  // (CONFIRMATION_DISMISS_MS) and blocked the NEXT buy click on actionability —
  // enough repeats and the step blew its 30 s cucumber timeout under load.
  private async settleAndDismiss(tile: Locator): Promise<void> {
    const confirmation = tile.getByTestId(TESTIDS.liveRates.tradeConfirmation);
    // Assert presence first so the negated matcher below can only be satisfied
    // by a real status change, never by a missing element.
    await expect(confirmation).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await expect(confirmation).not.toHaveAttribute(
      "data-status",
      IN_FLIGHT_STATUS,
      { timeout: SETTLE_TIMEOUT_MS },
    );
    await this.dismissConfirmationIn(tile);
    await expect(confirmation).toBeHidden({ timeout: SETTLE_TIMEOUT_MS });
  }

  // A DONE confirmation is a card whose only dismiss affordance is its DISMISS
  // chip (the overlay div has no click handler); every other terminal state
  // renders the whole overlay as a click-anywhere button. Clicking the right
  // target makes dismissal deterministic — previously this clicked the inert
  // card and the test only passed when the 5s auto-dismiss timer beat the 5s
  // hide assertion, a race the app now loses since the perf rounds made the
  // pre-assertion steps near-instant. Callers must ensure the execution has
  // already settled: while it is in flight NEITHER affordance exists, so both
  // branches here click an inert element and the overlay stays up.
  private async dismissConfirmationIn(tile: Locator): Promise<void> {
    const confirmation = tile.getByTestId(TESTIDS.liveRates.tradeConfirmation);
    const dismissChip = confirmation.locator('[data-action="dismiss"]');

    if ((await dismissChip.count()) > 0) {
      await dismissChip.click();
      return;
    }

    await confirmation.click();
  }

  async buyNTimesWithDismissals(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await this.clickBuyOnFirst();
      await this.dismissConfirmationOnceSettled();
    }
  }
}

// `data-status` value TileConfirmation renders while an execution is still in
// flight (its `statusKey()` "started" arm). Every other value is terminal and
// therefore dismissible.
const IN_FLIGHT_STATUS = "started";
// Generous next to the ≤2 s simulator settle — the margin absorbs CPU
// contention when run-all.ts runs every suite at once, without ever being a
// fixed cost, since each wait resolves as soon as its condition holds.
const SETTLE_TIMEOUT_MS = 15_000;
