import { expect, type Page } from "@playwright/test";

import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}

  async waitForSubmitButton(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.submitButton),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async hasBuyAndSellButtons(): Promise<boolean> {
    const buyVisible = await this.page
      .getByRole("button", { name: STRINGS.creditRfq.buyButton, exact: true })
      .isVisible();
    const sellVisible = await this.page
      .getByRole("button", { name: STRINGS.creditRfq.sellButton, exact: true })
      .isVisible();
    return buyVisible && sellVisible;
  }

  async hasDirectionLabel(): Promise<boolean> {
    return await this.page
      .getByTestId(TESTIDS.credit.directionLabel)
      .isVisible();
  }
}
