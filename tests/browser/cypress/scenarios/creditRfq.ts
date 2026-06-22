// tests/browser/cypress/scenarios/creditRfq.ts
// Cypress fork of tests/browser/scenarios/creditRfq.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import { assertTrue } from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

const VALID_CREDIT_TABS = new Set(["tiles", "new-rfq", "sell-side"]);

function ensureCreditTab(
  tab: string,
): asserts tab is "tiles" | "new-rfq" | "sell-side" {
  if (!VALID_CREDIT_TABS.has(tab))
    throw new Error(`unsupported credit tab: ${tab}`);
}

export function clickCreditTab(ctx: TestContext, tab: string): void {
  ensureCreditTab(tab);
  void ctx.po.creditRfqPanel.clickTab(tab);
}

export function expectCreditTabVisible(ctx: TestContext, tab: string): void {
  ensureCreditTab(tab);
  chainable(ctx.po.creditRfqPanel.tabIsVisible(tab)).then((v) =>
    assertTrue(v, `credit tab not visible: ${tab}`),
  );
}

export function expectMessageWithin(
  ctx: TestContext,
  message: string,
  seconds: number,
): void {
  if (message === "No RFQs to display") {
    void ctx.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
    return;
  }
  throw new Error(`message "${message}" has no PO method; add one if needed`);
}

export function expectCreditRfqSubmitButtonWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqForm.waitForSubmitButton(seconds * 1_000);
}

export function expectCreditRfqHasBuySellButtons(ctx: TestContext): void {
  chainable(ctx.po.creditRfqForm.hasBuyAndSellButtons()).then((v) =>
    assertTrue(v, "credit RFQ form missing Buy/Sell buttons"),
  );
}

export function expectCreditRfqHasDirectionLabel(ctx: TestContext): void {
  chainable(ctx.po.creditRfqForm.hasDirectionLabel()).then((v) =>
    assertTrue(v, "credit RFQ form missing Direction label"),
  );
}

export function expectSellSideHeadingWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqPanel.waitForSellSideHeading(seconds * 1_000);
}

export function expectCreditTradesHeadingWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
}
