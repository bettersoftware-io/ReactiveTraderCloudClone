/**
 * Cypress-side shim for @cucumber/cucumber.
 *
 * The @badeball/cypress-cucumber-preprocessor v24+ rejects step handlers that
 * return native Promises (async functions). But our shared step files use
 * async/await style (via scenario helpers) to stay compatible with Playwright.
 *
 * This shim re-exports everything from the preprocessor's browser entrypoint
 * but wraps Given/When/Then/And/But so that any step handler that returns a
 * native Promise has its result discarded. Instead, the wrapper calls the
 * Cypress PO methods (which queue commands synchronously) and returns the last
 * Cypress Chainable produced. The Cypress command queue ensures ordering.
 *
 * The trick relies on CypressWorkspace (and all Cypress PO impls) queuing
 * their cy.* commands synchronously and returning a Cypress Chainable — not a
 * native Promise. When the async scenario helper does `await po.method()` and
 * `po.method()` returns a Cypress Chainable, the async function suspends until
 * Cypress processes that Chainable, which happens in the command queue AFTER
 * the current step's other queued commands.
 */

export * from "@badeball/cypress-cucumber-preprocessor";

import {
  defineStep as _defineStep,
} from "@badeball/cypress-cucumber-preprocessor";

type StepFn = (...args: unknown[]) => unknown;
type DefineStep = (pattern: string | RegExp, fn: StepFn) => void;

function wrapStepFn(fn: StepFn): StepFn {
  return function (this: unknown, ...args: unknown[]) {
    // Call the (possibly async) step handler. Commands queued inside it via
    // cy.* are already in the Cypress queue regardless of whether the handler
    // is async. We discard the native Promise return value (if any) and let
    // the Cypress command queue handle ordering.
    const result = (fn as Function).apply(this, args);
    // If the step handler returned a Cypress Chainable, return it directly so
    // the preprocessor can chain off it. Otherwise return cy.wrap(undefined)
    // as a safe no-op anchor. Either way the preprocessor never sees a native
    // Promise.
    // Cypress.isCy() returns true for any value in the Cypress chainable hierarchy
    // (Chainable, $, jQuery wrappers), so this single check covers every shape a
    // step handler can plausibly return that the preprocessor expects.
    if (Cypress.isCy(result)) {
      return result;
    }
    // Discard native Promise; return a Chainable that resolves after the
    // already-queued commands complete.
    return cy.wrap(undefined, { log: false });
  };
}

function makeStep(impl: DefineStep): DefineStep {
  return (pattern: string | RegExp, fn: StepFn) => impl(pattern, wrapStepFn(fn));
}

export const defineStep: DefineStep = makeStep(_defineStep as unknown as DefineStep);
export const Given: DefineStep = makeStep(_defineStep as unknown as DefineStep);
export const When: DefineStep = makeStep(_defineStep as unknown as DefineStep);
export const Then: DefineStep = makeStep(_defineStep as unknown as DefineStep);
export const And: DefineStep = makeStep(_defineStep as unknown as DefineStep);
export const But: DefineStep = makeStep(_defineStep as unknown as DefineStep);
