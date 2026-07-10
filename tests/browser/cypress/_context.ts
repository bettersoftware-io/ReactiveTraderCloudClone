// tests/browser/cypress/_context.ts
// Body shape: sync, fire-and-forget; scenarios forked under tests/browser/cypress/scenarios/ — see Phase 5A.4 spec §3.3.
import "cypress-mochawesome-reporter/register";

import { buildCypressPageObjects } from "../page-objects/cypress/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

let currentCtx: TestContext | null = null;

beforeEach(() => {
  currentCtx = {
    po: buildCypressPageObjects(),
    scratch: new Scratchpad(),
  };
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
