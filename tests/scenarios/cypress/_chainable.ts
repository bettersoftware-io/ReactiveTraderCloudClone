// tests/scenarios/cypress/_chainable.ts
// Cypress POs return runtime Chainables but are typed as Promise<T> for shared-code
// compat with the Playwright-shaped tests/scenarios/*.ts layer. This cast helper
// exposes the chainable nature within the forked tests/scenarios/cypress/ layer
// so .then(cb) receives the subject and orders via the cy queue.
// See Phase 5A.4 spec §3.3.
export const chainable = <T>(p: Promise<T>): Cypress.Chainable<T> =>
  p as unknown as Cypress.Chainable<T>;
