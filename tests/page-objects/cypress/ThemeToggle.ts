import type { ThemeTogglePO } from "../contracts/ThemeToggle";
import { TESTIDS } from "../contracts/testids";

export class CypressThemeToggle implements ThemeTogglePO {
  click(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
        .click()
        .then(() => resolve());
    });
  }
  isVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }
  ariaLabel(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
        .then(($el) => resolve($el.attr("aria-label") ?? ""));
    });
  }
}
