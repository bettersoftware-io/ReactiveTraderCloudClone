import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { TESTIDS } from "../contracts/testids";

const RFQ_ID_PATTERN = /RFQ ID:\s*(\d+)/;

export class CypressCreditRfqForm implements CreditRfqFormPO {
  waitForSendButton(timeoutMs: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.send}"]`, {
        timeout: timeoutMs,
      })
      .should("be.visible") as unknown as Promise<void>;
  }

  hasDirectionButtons(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const buy = $body.find(
        `[data-testid="${TESTIDS.credit.newRfq.dirButton("buy")}"]`,
      );

      const sell = $body.find(
        `[data-testid="${TESTIDS.credit.newRfq.dirButton("sell")}"]`,
      );
      return (
        buy.length > 0 &&
        buy.is(":visible") &&
        sell.length > 0 &&
        sell.is(":visible")
      );
    }) as unknown as Promise<boolean>;
  }

  hasQtyInput(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(
        `[data-testid="${TESTIDS.credit.newRfq.qtyInput}"]`,
      );
      return found.length > 0 && found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  selectInstrument(instrumentId: number): Promise<void> {
    void cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.instrumentToggle}"]`)
      .click();
    return cy
      .get(
        `[data-testid="${TESTIDS.credit.newRfq.instrumentOption(instrumentId)}"]`,
      )
      .click() as unknown as Promise<void>;
  }

  fillQuantity(qty: string): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.qtyInput}"]`)
      .type(qty) as unknown as Promise<void>;
  }

  toggleDealer(dealerId: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.dealer(dealerId)}"]`)
      .click() as unknown as Promise<void>;
  }

  clickSend(): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.send}"]`)
      .click() as unknown as Promise<void>;
  }

  waitForConfirmedRfqId(timeoutMs: number): Promise<number> {
    return cy
      .get(`[data-testid="${TESTIDS.credit.newRfq.confirmed}"]`, {
        timeout: timeoutMs,
      })
      .should("be.visible")
      .invoke("text")
      .then((text) => {
        const match = RFQ_ID_PATTERN.exec(text);

        if (!match) {
          throw new Error(
            `could not parse RFQ id from confirmation text: "${text}"`,
          );
        }

        return Number(match[1]);
      }) as unknown as Promise<number>;
  }
}
