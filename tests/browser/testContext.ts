import type { PageObjects } from "./page-objects/contracts";

/**
 * Per-scenario typed scratchpad. A fresh instance is constructed for every
 * scenario by both PlaywrightWorld and the Cypress beforeEach hook. Holds all
 * cross-step state that used to live as module-level closures in step files.
 */
// eslint-disable-next-line rtc/class-filename-match -- shared e2e scratchpad helper; testContext.ts is a purpose-named harness module
export class Scratchpad {
  blotter = { recordedRowCounts: new Map<string, number>() };

  fxLiveRates = {
    recordedCounts: new Map<string, number>(),
    firstTileTextSnapshot: undefined as string | undefined,
  };

  theme = {
    backgroundBefore: undefined as string | undefined,
    backgroundAfter: undefined as string | undefined,
  };

  /** rfqId recorded by the "creates a new credit RFQ" step, read back by the
   * later steps that assert on the resulting card — quoteIds/rfqIds are
   * server-assigned, so there's nothing to hardcode in the Gherkin text. */
  creditRfq = {
    rfqId: undefined as number | undefined,
  };
}

/** What scenario functions accept. Driver-agnostic. */
export interface TestContext {
  po: PageObjects;
  scratch: Scratchpad;
}

/**
 * What step bodies bind `this` to. PlaywrightWorld satisfies it because it has
 * a `ctx: TestContext` field; the Cypress Mocha.Context satisfies it because
 * `browser/cypress-cucumber/e2e.ts` attaches `this.ctx` in beforeEach.
 */
export interface StepContext {
  ctx: TestContext;
}
