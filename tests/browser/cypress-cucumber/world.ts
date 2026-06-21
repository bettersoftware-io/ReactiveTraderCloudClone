import { buildCypressPageObjects } from "../page-objects/cypress/factory";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Mocha {
    interface Context {
      ctx: TestContext;
    }
  }
}

export function buildCypressContext(): TestContext {
  return {
    po: buildCypressPageObjects(),
    scratch: new Scratchpad(),
  };
}
