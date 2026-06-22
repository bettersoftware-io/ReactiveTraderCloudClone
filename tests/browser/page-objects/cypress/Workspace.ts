import { TESTIDS } from "../contracts/testids";
import type { WorkspacePO } from "../contracts/Workspace";

/**
 * Cypress impl of WorkspacePO. Methods return Promise<T> by chaining `.then`
 * on the underlying Cypress chainable so step bodies awaiting these calls
 * resolve in the same way they do under Playwright.
 */
export class CypressWorkspace implements WorkspacePO {
  open(): Promise<void> {
    return cy.visit("/") as unknown as Promise<void>;
  }

  openFx(): Promise<void> {
    cy.visit("/");
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`)
      .click() as unknown as Promise<void>;
  }

  openCredit(): Promise<void> {
    cy.visit("/");
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab("credit")}"]`)
      .click() as unknown as Promise<void>;
  }

  openAdmin(): Promise<void> {
    cy.visit("/");
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab("admin")}"]`)
      .click() as unknown as Promise<void>;
  }

  clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab(tab)}"]`)
      .click() as unknown as Promise<void>;
  }

  reload(): Promise<void> {
    return cy.reload() as unknown as Promise<void>;
  }

  setOffline(offline: boolean): Promise<void> {
    // The app's BrowserConnectionEventsAdapter listens to the window "online"
    // and "offline" events. Dispatching them directly (without CDP) is more
    // reliable across Cypress/Electron versions and avoids the cucumber
    // preprocessor's cy.task() context restriction that fires when
    // Cypress.automation native-Promise callbacks resolve outside the queue.
    return cy.window({ log: false }).then((win) => {
      win.dispatchEvent(new win.Event(offline ? "offline" : "online"));
    }) as unknown as Promise<void>;
  }

  rootBackgroundColor(): Promise<string> {
    return cy.get("#root > div").then(($el) => {
      return getComputedStyle($el[0]).backgroundColor;
    }) as unknown as Promise<string>;
  }

  wait(ms: number): Promise<void> {
    return cy.wait(ms) as unknown as Promise<void>;
  }
}
