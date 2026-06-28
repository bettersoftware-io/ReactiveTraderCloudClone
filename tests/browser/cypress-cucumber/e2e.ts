import { buildCypressContext } from "./world";

beforeEach(function buildCtx() {
  this.ctx = buildCypressContext();
  // ?nosplash suppresses the boot splash so scenarios interact with the live
  // app immediately. (Playwright suites rely on navigator.webdriver for the
  // same effect; Cypress does not reliably set it, so it opts out by URL.)
  cy.visit("/?nosplash");
});
