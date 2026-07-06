import type { TestContext } from "../testContext";
import { assertEquals, assertGte, assertTrue } from "./assert";

/** AAPL 2.4 08/30 — id 0 in InstrumentSimulator.INSTRUMENTS_CATALOG. */
const AAPL_INSTRUMENT_ID = 0;
/** Adaptive Bank — id 0 in DealerSimulator.DEALERS_CATALOG. CreditRfqSimulator
 * deliberately never schedules a simulated dealer response for Adaptive Bank
 * (the house dealer, see its `scheduleDealerResponse` skip) — quoting a new
 * RFQ to ONLY this dealer keeps its quote "pending" (no price) forever. That
 * is the one deterministic way to exercise "a quote arrives" without racing
 * the simulator's real, randomized (up to 30s, ~70%-chance-of-no-response)
 * dealer response used for every other dealer. */
const ADAPTIVE_BANK_DEALER_ID = 0;
/** CreditRfqSimulator.seedDemoState(): fixed demo seed ids, always present —
 * 238 (Closed, accepted by Citi) and 235 (Closed, accepted by Goldman Sachs)
 * are what the Credit Blotter's two starting rows derive from; 237 is
 * Cancelled. All three read as "closed" under the RFQs panel's CLOSED filter
 * (matchesFilter: state !== Open). */
const SEEDED_CLOSED_RFQ_IDS = [238, 237, 235];

export async function expectNoRfqsMessageWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
}

export async function expectSendButtonWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqForm.waitForSendButton(seconds * 1_000);
}

export async function expectHasDirectionButtons(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.creditRfqForm.hasDirectionButtons(),
    "credit RFQ form missing Buy/Sell direction buttons",
  );
}

export async function expectHasQtyInput(ctx: TestContext): Promise<void> {
  assertTrue(
    await ctx.po.creditRfqForm.hasQtyInput(),
    "credit RFQ form missing the quantity input",
  );
}

/** Fills and sends the New RFQ form for AAPL, quoted to Adaptive Bank only,
 * then waits for the "RFQ Created" confirmation and returns the new rfqId. */
export async function createAdaptiveBankOnlyRfq(
  ctx: TestContext,
  seconds: number,
): Promise<number> {
  await ctx.po.creditRfqForm.selectInstrument(AAPL_INSTRUMENT_ID);
  await ctx.po.creditRfqForm.fillQuantity("500");
  await ctx.po.creditRfqForm.toggleDealer(ADAPTIVE_BANK_DEALER_ID);
  await ctx.po.creditRfqForm.clickSend();
  return await ctx.po.creditRfqForm.waitForConfirmedRfqId(seconds * 1_000);
}

export async function expectRfqCardWithin(
  ctx: TestContext,
  rfqId: number,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForRfqCard(rfqId, seconds * 1_000);
}

export async function expectFirstQuoteStatePending(
  ctx: TestContext,
  rfqId: number,
): Promise<void> {
  assertEquals(
    await ctx.po.creditRfqPanel.firstQuoteState(rfqId),
    "pending",
    `expected rfq ${rfqId}'s first quote to be pending (no price)`,
  );
}

export async function clickClosedFilter(ctx: TestContext): Promise<void> {
  await ctx.po.creditRfqPanel.clickFilterPill("closed");
}

export async function expectSeededClosedRfqsVisible(
  ctx: TestContext,
): Promise<void> {
  for (const rfqId of SEEDED_CLOSED_RFQ_IDS) {
    assertTrue(
      await ctx.po.creditRfqPanel.rfqCardIsVisible(rfqId),
      `seeded closed rfq card not visible: ${rfqId}`,
    );
  }
}

export async function expectCreditTradesHeadingWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
}

export async function expectCreditBlotterRowCountAtLeast(
  ctx: TestContext,
  minCount: number,
): Promise<void> {
  assertGte(
    await ctx.po.blotterTable.rowCount(),
    minCount,
    `expected the credit blotter to have at least ${minCount} rows`,
  );
}
