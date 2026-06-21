import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class CypressCreditRfqPanel implements CreditRfqPanelPO {
  navIsVisible(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.credit.nav}"]`);
      return found.length > 0 && found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.credit.tab(tab)}"]`);
      return found.length > 0 && found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.tab(tab)}"]`)
      .click() as unknown as Promise<void>;
  }

  waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    return cy
      .contains(STRINGS.creditRfq.noRfqsMessage, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  waitForSellSideHeading(timeoutMs: number): Promise<void> {
    return cy
      .contains(STRINGS.creditRfq.sellSideHeading, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    return cy
      .contains(STRINGS.creditRfq.creditTradesHeading, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }
}
