import { TESTIDS } from "../contracts/testids";
import type { WorkspacePO } from "../contracts/Workspace";

/**
 * Cypress impl of WorkspacePO. Methods return Promise<T> by chaining `.then`
 * on the underlying Cypress chainable so step bodies awaiting these calls
 * resolve in the same way they do under Playwright.
 */
export class CypressWorkspace implements WorkspacePO {
  open(): Promise<void> {
    return cy.visit("/?nosplash") as unknown as Promise<void>;
  }

  openFx(): Promise<void> {
    cy.visit("/?nosplash");
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`)
      .click() as unknown as Promise<void>;
  }

  openCredit(): Promise<void> {
    cy.visit("/?nosplash");
    return cy
      .get(`[data-testid="${TESTIDS.shell.tab("credit")}"]`)
      .click() as unknown as Promise<void>;
  }

  openAdmin(): Promise<void> {
    cy.visit("/?nosplash");
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
    //
    // ROOT-CAUSE GATE: a synthetic dispatch is silently DROPPED if the adapter's
    // window listener is not attached yet. The adapter subscribes inside a React
    // effect once the app mounts and connects, so before dispatching "offline"
    // we wait — as a queued cy command, so the queue orders it BEFORE the
    // dispatch — for the footer to read "Connected" (our proxy for "listener is
    // wired up"). Without this the overlay never appears because the event
    // vanished, not because of render timing (verified: the app stayed
    // "Connected" after a dispatch+wait). Mirrors browser/cypress/scenarios/
    // connection.ts; the raw-Cypress fork does the same. Online needs no gate —
    // by then the listener is definitely attached.
    if (offline) {
      cy.get(`[data-testid="${TESTIDS.connection.status}"]`, {
        log: false,
      }).should("contain.text", "Connected");
    }

    return cy.window({ log: false }).then((win) => {
      win.dispatchEvent(new win.Event(offline ? "offline" : "online"));
    }) as unknown as Promise<void>;
  }

  rootBackgroundColor(): Promise<string> {
    return cy.get("#root > div").then(($el) => {
      return getComputedStyle($el[0]).backgroundColor;
    }) as unknown as Promise<string>;
  }

  clickTestId(id: string): Promise<void> {
    return cy.get(`[data-testid="${id}"]`).click() as unknown as Promise<void>;
  }

  wait(ms: number): Promise<void> {
    return cy.wait(ms) as unknown as Promise<void>;
  }
}
