import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class CypressCreditRfqPanel implements CreditRfqPanelPO {
  dockIsVisible(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const form = $body.find(
        `[data-testid="${TESTIDS.credit.newRfq.headTitle}"]`,
      );
      const rfqs = $body.find(
        `[data-testid="${TESTIDS.credit.rfqs.headTitle}"]`,
      );
      const blotter = $body.find(
        `[data-testid="${TESTIDS.credit.blotterHeadTitle}"]`,
      );
      return (
        form.length > 0 &&
        form.is(":visible") &&
        rfqs.length > 0 &&
        rfqs.is(":visible") &&
        blotter.length > 0 &&
        blotter.is(":visible")
      );
    }) as unknown as Promise<boolean>;
  }

  waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    return cy
      .contains(STRINGS.creditRfq.noRfqsMessage, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  clickFilterPill(filter: "live" | "closed" | "all"): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.rfqs.filterPill(filter)}"]`)
      .click() as unknown as Promise<void>;
  }

  waitForRfqCard(rfqId: number, timeoutMs: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.rfqs.card(rfqId)}"]`, {
        timeout: timeoutMs,
      })
      .should("be.visible") as unknown as Promise<void>;
  }

  rfqCardIsVisible(rfqId: number): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(
        `[data-testid="${TESTIDS.credit.rfqs.card(rfqId)}"]`,
      );
      return found.length > 0 && found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  firstQuoteState(rfqId: number): Promise<string | null> {
    return cy.get("body").then(($body) => {
      const card = $body.find(
        `[data-testid="${TESTIDS.credit.rfqs.card(rfqId)}"]`,
      );
      const quoteRow = card
        .find(`[data-testid^="${TESTIDS.credit.rfqs.quotePrefix}"][data-state]`)
        .first();
      if (quoteRow.length === 0) return null;
      return quoteRow.attr("data-state") ?? null;
    }) as unknown as Promise<string | null>;
  }

  waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    // The in-body "Credit Trades" title is gone (the blotter chrome moved
    // into the panel head) — the head tab title is the loaded-marker now.
    return cy
      .get(`[data-testid="${TESTIDS.credit.blotterHeadTitle}"]`, {
        timeout: timeoutMs,
      })
      .should("be.visible") as unknown as Promise<void>;
  }
}
