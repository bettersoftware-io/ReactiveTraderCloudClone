import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { STRINGS } from "../contracts/strings";
import { TESTIDS } from "../contracts/testids";

export class CypressCreditRfqForm implements CreditRfqFormPO {
  waitForSubmitButton(timeoutMs: number): Promise<void> {
    return cy
      .contains(STRINGS.creditRfq.submitButton, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  hasBuyAndSellButtons(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const buyBtn = $body
        .find("button")
        .filter(
          (_, el) => el.textContent?.trim() === STRINGS.creditRfq.buyButton,
        );
      const sellBtn = $body
        .find("button")
        .filter(
          (_, el) => el.textContent?.trim() === STRINGS.creditRfq.sellButton,
        );
      return (
        buyBtn.length > 0 &&
        buyBtn.is(":visible") &&
        sellBtn.length > 0 &&
        sellBtn.is(":visible")
      );
    }) as unknown as Promise<boolean>;
  }

  hasDirectionLabel(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const $label = $body.find(
        `[data-testid="${TESTIDS.credit.directionLabel}"]`,
      );
      return $label.length > 0 && $label.is(":visible");
    }) as unknown as Promise<boolean>;
  }
}
