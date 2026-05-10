import type { WorkspacePO } from "../contracts/Workspace";
import { TESTIDS } from "../contracts/testids";

/**
 * Cypress impl of WorkspacePO. Methods return Promise<T> by chaining `.then`
 * on the underlying Cypress chainable so step bodies awaiting these calls
 * resolve in the same way they do under Playwright.
 */
export class CypressWorkspace implements WorkspacePO {
  open(): Promise<void> {
    cy.visit("/");
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  openFx(): Promise<void> {
    cy.visit("/");
    cy.get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`).click();
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  openCredit(): Promise<void> {
    cy.visit("/");
    cy.get(`[data-testid="${TESTIDS.shell.tab("credit")}"]`).click();
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  openAdmin(): Promise<void> {
    cy.visit("/");
    cy.get(`[data-testid="${TESTIDS.shell.tab("admin")}"]`).click();
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    cy.get(`[data-testid="${TESTIDS.shell.tab(tab)}"]`).click();
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  reload(): Promise<void> {
    cy.reload();
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  setOffline(offline: boolean): Promise<void> {
    // The app's BrowserConnectionEventsAdapter listens to the window "online"
    // and "offline" events. Dispatching them directly (without CDP) is more
    // reliable across Cypress/Electron versions and avoids the cucumber
    // preprocessor's cy.task() context restriction that fires when
    // Cypress.automation native-Promise callbacks resolve outside the queue.
    cy.window({ log: false }).then((win) => {
      win.dispatchEvent(new win.Event(offline ? "offline" : "online"));
    });
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
  rootBackgroundColor(): Promise<string> {
    return cy.get("#root > div").then(($el) =>
      getComputedStyle($el[0]).backgroundColor
    ) as unknown as Promise<string>;
  }
  wait(ms: number): Promise<void> {
    cy.wait(ms);
    return cy.wrap(undefined) as unknown as Promise<void>;
  }
}
