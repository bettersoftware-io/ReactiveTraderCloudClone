import type { WorkspacePO } from "../contracts/Workspace";
import { TESTIDS } from "../contracts/testids";

/**
 * Cypress impl of WorkspacePO. Methods return native Promise<T> by wrapping
 * the underlying Cypress chain in `new Promise(...)` and resolving in a
 * trailing `.then(...)`. This makes the contract honest at runtime so that
 * `await ctx.po.workspace.x()` in raw Cypress `it()` bodies actually yields
 * the subject (rather than a Chainable cast as a Promise).
 */
export class CypressWorkspace implements WorkspacePO {
  open(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.visit("/");
      cy.wrap(undefined).then(() => resolve());
    });
  }
  openFx(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.visit("/");
      cy.get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`).click();
      cy.wrap(undefined).then(() => resolve());
    });
  }
  openCredit(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.visit("/");
      cy.get(`[data-testid="${TESTIDS.shell.tab("credit")}"]`).click();
      cy.wrap(undefined).then(() => resolve());
    });
  }
  openAdmin(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.visit("/");
      cy.get(`[data-testid="${TESTIDS.shell.tab("admin")}"]`).click();
      cy.wrap(undefined).then(() => resolve());
    });
  }
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.tab(tab)}"]`).click();
      cy.wrap(undefined).then(() => resolve());
    });
  }
  reload(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.reload();
      cy.wrap(undefined).then(() => resolve());
    });
  }
  setOffline(offline: boolean): Promise<void> {
    // The app's BrowserConnectionEventsAdapter listens to the window "online"
    // and "offline" events. Dispatching them directly (without CDP) is more
    // reliable across Cypress/Electron versions and avoids the cucumber
    // preprocessor's cy.task() context restriction that fires when
    // Cypress.automation native-Promise callbacks resolve outside the queue.
    return new Promise<void>((resolve) => {
      cy.window({ log: false }).then((win) => {
        win.dispatchEvent(new win.Event(offline ? "offline" : "online"));
      });
      cy.wrap(undefined).then(() => resolve());
    });
  }
  rootBackgroundColor(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get("#root > div").then(($el) =>
        resolve(getComputedStyle($el[0]).backgroundColor),
      );
    });
  }
  wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.wait(ms);
      cy.wrap(undefined).then(() => resolve());
    });
  }
}
