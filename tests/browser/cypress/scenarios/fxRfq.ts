// tests/browser/cypress/scenarios/fxRfq.ts
// Cypress fork of tests/browser/scenarios/fxRfq.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.
import type { TestContext } from "../../testContext";

export function expectRfqInitiationButtonWithin(ctx: TestContext, seconds: number): void {
  void ctx.po.fxRfqForm.waitForRfqButton(seconds * 1_000);
}

export function clickRfqInitiationButton(ctx: TestContext): void {
  void ctx.po.fxRfqForm.clickInitiateRfq();
}

export function expectCountdownOrQuoteWithin(ctx: TestContext, seconds: number): void {
  void ctx.po.fxRfqForm.waitForCountdownOrQuote(seconds * 1_000);
}
