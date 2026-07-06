import { expect, type Page } from "@playwright/test";

import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  constructor(private readonly page: Page) {}

  async dockIsVisible(): Promise<boolean> {
    const [form, rfqs, blotter] = await Promise.all([
      this.page.getByTestId(TESTIDS.credit.newRfq.headTitle).isVisible(),
      this.page.getByTestId(TESTIDS.credit.rfqs.headTitle).isVisible(),
      this.page.getByTestId(TESTIDS.credit.blotterHeadTitle).isVisible(),
    ]);
    return form && rfqs && blotter;
  }

  async waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.noRfqsMessage),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async clickFilterPill(filter: "live" | "closed" | "all"): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.rfqs.filterPill(filter)).click();
  }

  async waitForRfqCard(rfqId: number, timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByTestId(TESTIDS.credit.rfqs.card(rfqId)),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async rfqCardIsVisible(rfqId: number): Promise<boolean> {
    return await this.page
      .getByTestId(TESTIDS.credit.rfqs.card(rfqId))
      .isVisible();
  }

  async firstQuoteState(rfqId: number): Promise<string | null> {
    const card = this.page.getByTestId(TESTIDS.credit.rfqs.card(rfqId));
    const quoteRow = card
      .locator(
        `[data-testid^="${TESTIDS.credit.rfqs.quotePrefix}"][data-state]`,
      )
      .first();
    return await quoteRow.getAttribute("data-state");
  }

  async waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByText(STRINGS.creditRfq.creditTradesHeading, {
        exact: true,
      }),
    ).toBeVisible({ timeout: timeoutMs });
  }
}
