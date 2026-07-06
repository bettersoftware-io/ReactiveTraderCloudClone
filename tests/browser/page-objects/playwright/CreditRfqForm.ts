import { expect, type Page } from "@playwright/test";

import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { TESTIDS } from "../contracts/testids";

const RFQ_ID_PATTERN = /RFQ ID:\s*(\d+)/;

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}

  async waitForSendButton(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.credit.newRfq.send)).toBeVisible(
      { timeout: timeoutMs },
    );
  }

  async hasDirectionButtons(): Promise<boolean> {
    const buyVisible = await this.page
      .getByTestId(TESTIDS.credit.newRfq.dirButton("buy"))
      .isVisible();
    const sellVisible = await this.page
      .getByTestId(TESTIDS.credit.newRfq.dirButton("sell"))
      .isVisible();
    return buyVisible && sellVisible;
  }

  async hasQtyInput(): Promise<boolean> {
    return await this.page
      .getByTestId(TESTIDS.credit.newRfq.qtyInput)
      .isVisible();
  }

  async selectInstrument(instrumentId: number): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.newRfq.instrumentToggle).click();
    await this.page
      .getByTestId(TESTIDS.credit.newRfq.instrumentOption(instrumentId))
      .click();
  }

  async fillQuantity(qty: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.newRfq.qtyInput).fill(qty);
  }

  async toggleDealer(dealerId: number): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.newRfq.dealer(dealerId)).click();
  }

  async clickSend(): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.newRfq.send).click();
  }

  async waitForConfirmedRfqId(timeoutMs: number): Promise<number> {
    const locator = this.page.getByTestId(TESTIDS.credit.newRfq.confirmed);
    await expect(locator).toBeVisible({ timeout: timeoutMs });
    const text = (await locator.textContent()) ?? "";
    const match = RFQ_ID_PATTERN.exec(text);

    if (!match) {
      throw new Error(
        `could not parse RFQ id from confirmation text: "${text}"`,
      );
    }

    return Number(match[1]);
  }
}
