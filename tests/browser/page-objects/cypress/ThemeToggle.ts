import type { ThemeTogglePO } from "../contracts/ThemeToggle";
import { TESTIDS } from "../contracts/testids";

export class CypressThemeToggle implements ThemeTogglePO {
  click(): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
      .click() as unknown as Promise<void>;
  }

  isVisible(): Promise<boolean> {
    return cy
      .get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
      .then(($el) => {
        return $el.is(":visible");
      }) as unknown as Promise<boolean>;
  }

  ariaLabel(): Promise<string> {
    return cy
      .get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
      .then(($el) => {
        return $el.attr("aria-label") ?? "";
      }) as unknown as Promise<string>;
  }
}
