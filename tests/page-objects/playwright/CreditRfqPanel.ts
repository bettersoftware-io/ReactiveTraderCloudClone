import { expect, type Page } from "@playwright/test";
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
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
    await expect(this.page.getByText("No RFQs to display")).toBeVisible({ timeout: timeoutMs });
  }
  async waitForSellSideHeading(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Sell Side (Adaptive Bank)")).toBeVisible({ timeout: timeoutMs });
  }
  async waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Credit Trades", { exact: true })).toBeVisible({ timeout: timeoutMs });
  }
}
