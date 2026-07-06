// tests/browser/cypress/scenarios/creditRfq.ts
// Cypress fork of tests/browser/scenarios/creditRfq.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import {
  assertEquals,
  assertGte,
  assertTrue,
} from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

/** AAPL 2.4 08/30 — id 0 in InstrumentSimulator.INSTRUMENTS_CATALOG. */
const AAPL_INSTRUMENT_ID = 0;
/** Adaptive Bank — id 0 in DealerSimulator.DEALERS_CATALOG; see the async
 * fork (tests/browser/scenarios/creditRfq.ts) for why quoting to only this
 * dealer keeps the resulting quote deterministically "pending" forever. */
const ADAPTIVE_BANK_DEALER_ID = 0;
/** CreditRfqSimulator.seedDemoState(): fixed demo seed ids, always present. */
const SEEDED_CLOSED_RFQ_IDS = [238, 237, 235];

export function expectNoRfqsMessageWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
}

export function expectSendButtonWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqForm.waitForSendButton(seconds * 1_000);
}

export function expectHasDirectionButtons(ctx: TestContext): void {
  chainable(ctx.po.creditRfqForm.hasDirectionButtons()).then((v) => {
    return assertTrue(v, "credit RFQ form missing Buy/Sell direction buttons");
  });
}

export function expectHasQtyInput(ctx: TestContext): void {
  chainable(ctx.po.creditRfqForm.hasQtyInput()).then((v) => {
    return assertTrue(v, "credit RFQ form missing the quantity input");
  });
}

/** Fills and sends the New RFQ form for AAPL, quoted to Adaptive Bank only,
 * then waits for the "RFQ Created" confirmation. The rfqId is stashed on
 * ctx.scratch by the caller via the returned chainable's `.then`. */
export function createAdaptiveBankOnlyRfq(
  ctx: TestContext,
  seconds: number,
): Cypress.Chainable<number> {
  void ctx.po.creditRfqForm.selectInstrument(AAPL_INSTRUMENT_ID);
  void ctx.po.creditRfqForm.fillQuantity("500");
  void ctx.po.creditRfqForm.toggleDealer(ADAPTIVE_BANK_DEALER_ID);
  void ctx.po.creditRfqForm.clickSend();
  return chainable(ctx.po.creditRfqForm.waitForConfirmedRfqId(seconds * 1_000));
}

export function expectRfqCardWithin(
  ctx: TestContext,
  rfqId: number,
  seconds: number,
): void {
  void ctx.po.creditRfqPanel.waitForRfqCard(rfqId, seconds * 1_000);
}

export function expectFirstQuoteStatePending(
  ctx: TestContext,
  rfqId: number,
): void {
  chainable(ctx.po.creditRfqPanel.firstQuoteState(rfqId)).then((state) => {
    return assertEquals(
      state,
      "pending",
      `expected rfq ${rfqId}'s first quote to be pending (no price)`,
    );
  });
}

export function clickClosedFilter(ctx: TestContext): void {
  void ctx.po.creditRfqPanel.clickFilterPill("closed");
}

export function expectSeededClosedRfqsVisible(ctx: TestContext): void {
  for (const rfqId of SEEDED_CLOSED_RFQ_IDS) {
    chainable(ctx.po.creditRfqPanel.rfqCardIsVisible(rfqId)).then((v) => {
      return assertTrue(v, `seeded closed rfq card not visible: ${rfqId}`);
    });
  }
}

export function expectCreditTradesHeadingWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
}

export function expectCreditBlotterRowCountAtLeast(
  ctx: TestContext,
  minCount: number,
): void {
  chainable(ctx.po.blotterTable.rowCount()).then((count) => {
    return assertGte(
      count,
      minCount,
      `expected the credit blotter to have at least ${minCount} rows`,
    );
  });
}
