import { buildCypressContext } from "./world";

beforeEach(function () {
  this.ctx = buildCypressContext();
  cy.visit("/");
});
