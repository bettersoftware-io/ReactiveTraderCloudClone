import { expect, type Page } from "@playwright/test";
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  constructor(private readonly page: Page) {}

  async navIsVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.nav).isVisible();
  }
  async tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.tab(tab)).isVisible();
  }
  async clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.tab(tab)).click();
  }
  async waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.noRfqsMessage),
    ).toBeVisible({ timeout: timeoutMs });
  }
  async waitForSellSideHeading(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.sellSideHeading),
    ).toBeVisible({ timeout: timeoutMs });
  }
  async waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.creditTradesHeading, {
        exact: true,
      }),
    ).toBeVisible({ timeout: timeoutMs });
  }
}
