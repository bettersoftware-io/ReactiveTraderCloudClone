import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { TESTIDS } from "../contracts/testids";
import { STRINGS } from "../contracts/strings";

export class CypressCreditRfqPanel implements CreditRfqPanelPO {
  navIsVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.credit.nav}"]`);
        resolve(found.length > 0 && found.is(":visible"));
      });
    });
  }

  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.credit.tab(tab)}"]`);
        resolve(found.length > 0 && found.is(":visible"));
      });
    });
  }

  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.credit.tab(tab)}"]`)
        .click()
        .then(() => resolve());
    });
  }

  waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.contains(STRINGS.creditRfq.noRfqsMessage, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }

  waitForSellSideHeading(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.contains(STRINGS.creditRfq.sellSideHeading, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }

  waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.contains(STRINGS.creditRfq.creditTradesHeading, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
}
