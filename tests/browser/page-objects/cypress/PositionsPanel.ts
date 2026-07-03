import type { PositionsPanelPO } from "../contracts/PositionsPanel";
import { TESTIDS } from "../contracts/testids";

const PANEL_SELECTOR = `[data-testid="${TESTIDS.positions.panel}"]`;
const BUBBLE_SELECTOR = `[data-testid^="${TESTIDS.positions.bubblePrefix}"]`;
const ROW_SELECTOR = `[data-testid^="${TESTIDS.positions.rowPrefix}"]`;

export class CypressPositionsPanel implements PositionsPanelPO {
  private panel(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(PANEL_SELECTOR);
  }

  waitVisible(timeoutMs: number): Promise<void> {
    return cy
      .get(PANEL_SELECTOR, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  isVisible(): Promise<boolean> {
    return this.panel().then(($el) => {
      return $el.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  bubbleCount(): Promise<number> {
    return this.panel().then(($panel) => {
      return $panel.find(BUBBLE_SELECTOR).length;
    }) as unknown as Promise<number>;
  }

  firstBubbleSign(): Promise<string | null> {
    return this.panel().then(($panel) => {
      const $first = $panel.find(BUBBLE_SELECTOR).first();
      return $first.length > 0 ? ($first.attr("data-sign") ?? null) : null;
    }) as unknown as Promise<string | null>;
  }

  firstBubbleText(): Promise<string> {
    return this.panel().then(($panel) => {
      return $panel.find(BUBBLE_SELECTOR).first().text();
    }) as unknown as Promise<string>;
  }

  rowCount(): Promise<number> {
    return this.panel().then(($panel) => {
      return $panel.find(ROW_SELECTOR).length;
    }) as unknown as Promise<number>;
  }

  firstRowSign(): Promise<string | null> {
    return this.panel().then(($panel) => {
      const $first = $panel.find(ROW_SELECTOR).first().find("[data-sign]");
      return $first.length > 0 ? ($first.attr("data-sign") ?? null) : null;
    }) as unknown as Promise<string | null>;
  }

  firstRowText(): Promise<string> {
    return this.panel().then(($panel) => {
      return $panel.find(ROW_SELECTOR).first().text();
    }) as unknown as Promise<string>;
  }
}
