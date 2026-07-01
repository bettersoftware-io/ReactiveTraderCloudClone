// Registers cypress-mochawesome-reporter's per-test hooks (screenshot capture,
// log embedding) — matches browser/cypress/_context.ts. The report itself is
// configured in cypress.config.ts; see the comment there for why we use
// mochawesome instead of the cucumber-preprocessor's reload-fragile html report.
import "cypress-mochawesome-reporter/register";

import { buildCypressContext } from "./world";

beforeEach(function buildCtx() {
  this.ctx = buildCypressContext();
  // ?nosplash suppresses the boot splash so scenarios interact with the live
  // app immediately. (Playwright suites rely on navigator.webdriver for the
  // same effect; Cypress does not reliably set it, so it opts out by URL.)
  cy.visit("/?nosplash");
});
