import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";
import { TESTIDS } from "../contracts/testids";

export class CypressConnectionOverlay implements ConnectionOverlayPO {
  isHidden(): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.connection.overlay}"]`);
      return found.length === 0 || !found.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  waitVisible(timeoutMs: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.connection.overlay}"]`, {
        timeout: timeoutMs,
      })
      .should("be.visible") as unknown as Promise<void>;
  }

  waitHidden(timeoutMs: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.connection.overlay}"]`, {
        timeout: timeoutMs,
      })
      .should("not.exist") as unknown as Promise<void>;
  }

  text(): Promise<string> {
    return cy
      .get(`[data-testid="${TESTIDS.connection.overlay}"]`)
      .then(($el) => {
        return $el.text();
      }) as unknown as Promise<string>;
  }

  clearIncident(): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.connection.clearIncident}"]`)
      .click() as unknown as Promise<void>;
  }
}
