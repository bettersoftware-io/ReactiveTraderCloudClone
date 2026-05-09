import { expect, type Page } from "@playwright/test";
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}

  async waitForSubmitButton(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Submit RFQ")).toBeVisible({ timeout: timeoutMs });
  }
  async hasBuyAndSellButtons(): Promise<boolean> {
    const buyVisible = await this.page
      .getByRole("button", { name: "Buy", exact: true })
      .isVisible();
    const sellVisible = await this.page
      .getByRole("button", { name: "Sell", exact: true })
      .isVisible();
    return buyVisible && sellVisible;
  }
  async hasDirectionLabel(): Promise<boolean> {
    return await this.page
      .locator("label")
      .filter({ hasText: "Direction" })
      .isVisible();
  }
}
