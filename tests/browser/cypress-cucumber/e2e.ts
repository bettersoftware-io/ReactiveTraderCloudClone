// Registers cypress-mochawesome-reporter's per-test hooks (screenshot capture,
// log embedding) — matches browser/cypress/_context.ts. The report itself is
// configured in cypress.config.ts; see the comment there for why we use
// mochawesome instead of the cucumber-preprocessor's reload-fragile html report.
import "cypress-mochawesome-reporter/register";

import { E2E_SESSION_JSON, E2E_SESSION_KEY } from "../authSeed";
import { buildCypressContext } from "./world";

beforeEach(function buildCtx() {
  this.ctx = buildCypressContext();
  // Seed an authenticated session before the visit below (and any other
  // cy.visit in the scenario) — Cypress clears localStorage between tests,
  // and AuthGate otherwise shows LoginScreen instead of the app.
  // window:before:load fires ahead of app scripts on every navigation, so one
  // registration here covers all visits in the test.
  Cypress.on("window:before:load", (win) => {
    win.localStorage.setItem(E2E_SESSION_KEY, E2E_SESSION_JSON);
  });
  // ?nosplash suppresses the boot splash so scenarios interact with the live
  // app immediately. (Playwright suites rely on navigator.webdriver for the
  // same effect; Cypress does not reliably set it, so it opts out by URL.)
  cy.visit("/?nosplash");
});
