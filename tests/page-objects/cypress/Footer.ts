import type { FooterPO } from "../contracts/Footer";
import { TESTIDS } from "../contracts/testids";

export class CypressFooter implements FooterPO {
  connectionLabel(): Promise<string> {
    return cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
      .then(($el) => $el.text()) as unknown as Promise<string>;
  }
  isStatusVisible(): Promise<boolean> {
    return cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
      .then(($el) => $el.is(":visible")) as unknown as Promise<boolean>;
  }
}
