import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";
import { TESTIDS } from "../contracts/testids";

export class CypressConnectionOverlay implements ConnectionOverlayPO {
  isHidden(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.connection.overlay}"]`);
        resolve(found.length === 0 || !found.is(":visible"));
      });
    });
  }
  waitVisible(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  waitHidden(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`, { timeout: timeoutMs })
        .should("not.exist")
        .then(() => resolve());
    });
  }
  text(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`)
        .then(($el) => resolve($el.text()));
    });
  }
}
