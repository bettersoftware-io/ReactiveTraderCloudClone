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
  setOffline(_offline: boolean): Promise<void> {
    // Implemented in Task 14 via CDP. Throw a clear marker for now so any
    // scenario that hits this path before Task 14 fails loudly.
    throw new Error("CypressWorkspace.setOffline pending Task 14 (CDP); tag affected scenarios @playwright-only if blocking");
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
