// tests/raw/cypress/_context.ts
// Body shape: sync, fire-and-forget; scenarios forked under tests/scenarios/cypress/ — see Phase 5A.4 spec §3.3.
import type { TestContext } from "../../support/testContext";
import { Scratchpad } from "../../support/testContext";
import { buildCypressPageObjects } from "../../page-objects/cypress/factory";

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
  if (!currentCtx) throw new Error("ctx not available outside it()/beforeEach");
  return currentCtx;
}
