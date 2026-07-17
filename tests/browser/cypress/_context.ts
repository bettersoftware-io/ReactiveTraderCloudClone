// tests/browser/cypress/_context.ts
// Body shape: sync, fire-and-forget; scenarios forked under tests/browser/cypress/scenarios/ — see Phase 5A.4 spec §3.3.
import "cypress-mochawesome-reporter/register";

import { E2E_SESSION_JSON, E2E_SESSION_KEY } from "../authSeed";
import { buildCypressPageObjects } from "../page-objects/cypress/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

let currentCtx: TestContext | null = null;

beforeEach(() => {
  currentCtx = {
    po: buildCypressPageObjects(),
    scratch: new Scratchpad(),
  };
  // Seed an authenticated session for every cy.visit in this test — Cypress
  // clears localStorage between tests, and AuthGate otherwise shows
  // LoginScreen instead of the app. window:before:load fires ahead of app
  // scripts on EVERY navigation (including the multi-visit page-object
  // methods like openFx/openCredit/openAdmin), so one registration here
  // covers all of them rather than editing each cy.visit call.
  Cypress.on("window:before:load", (win) => {
    win.localStorage.setItem(E2E_SESSION_KEY, E2E_SESSION_JSON);
  });
});

afterEach(() => {
  currentCtx = null;
});

export function getCtx(): TestContext {
  if (!currentCtx) {
    throw new Error("ctx not available outside it()/beforeEach");
  }

  return currentCtx;
}
