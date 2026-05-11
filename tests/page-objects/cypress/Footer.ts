import type { FooterPO } from "../contracts/Footer";
import { TESTIDS } from "../contracts/testids";

export class CypressFooter implements FooterPO {
  connectionLabel(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
        .then(($el) => resolve($el.text()));
    });
  }
  isStatusVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }
}
