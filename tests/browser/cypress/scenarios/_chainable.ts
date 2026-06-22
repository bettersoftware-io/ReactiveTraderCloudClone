// tests/browser/cypress/scenarios/_chainable.ts
//
// The PO contract methods are typed as Promise<T> to share signatures with the
// Playwright-shaped tests/browser/scenarios/*.ts layer. But the Cypress runtime returns
// a Cypress.Chainable<T>, not a real Promise — the two are intentionally
// incompatible: a Chainable enqueues onto cy.* whereas a native Promise resolves
// on the microtask queue. The PO impls return chainables cast as Promises so
// shared step bodies type-check, and this helper bridges the cast back to the
// chainable nature inside the forked tests/browser/cypress/scenarios/ layer. Use it
// when you need .then(cb) to receive the subject and order via the cy queue.
//
// Note: .should(cb) is load-bearing for retry — switching to .then(cb) drops
// Cypress's auto-retry semantics. See setBrowserOffline + the should() call
// sites in connection.ts for why this matters.
//
// See Phase 5A.4 spec §3.3 for the fork rationale.
export function chainable<T>(p: Promise<T>): Cypress.Chainable<T> {
  return p as unknown as Cypress.Chainable<T>;
}
