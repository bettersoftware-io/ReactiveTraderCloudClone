import { buildCypressContext } from "./world";

beforeEach(function buildCtx() {
  this.ctx = buildCypressContext();
  cy.visit("/");
});
