import { expect, type Page } from "@playwright/test";

import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel.ts";
import { STRINGS } from "../contracts/strings.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

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
    // The in-body "Credit Trades" title is gone (the blotter chrome moved
    // into the panel head) — the head tab title is the loaded-marker now.
    await expect(
      this.page.getByTestId(TESTIDS.credit.blotterHeadTitle),
    ).toBeVisible({ timeout: timeoutMs });
  }
}
