import type { TestContext } from "../testContext";
import { assertTrue } from "./assert";

const VALID_CREDIT_TABS = new Set(["tiles", "new-rfq", "sell-side"]);

function ensureCreditTab(
  tab: string,
): asserts tab is "tiles" | "new-rfq" | "sell-side" {
  if (!VALID_CREDIT_TABS.has(tab))
    throw new Error(`unsupported credit tab: ${tab}`);
}

export async function clickCreditTab(
  ctx: TestContext,
  tab: string,
): Promise<void> {
  ensureCreditTab(tab);
  await ctx.po.creditRfqPanel.clickTab(tab);
}

export async function expectCreditTabVisible(
  ctx: TestContext,
  tab: string,
): Promise<void> {
  ensureCreditTab(tab);
  assertTrue(
    await ctx.po.creditRfqPanel.tabIsVisible(tab),
    `credit tab not visible: ${tab}`,
  );
}

export async function expectMessageWithin(
  ctx: TestContext,
  message: string,
  seconds: number,
): Promise<void> {
  if (message === "No RFQs to display") {
    await ctx.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
    return;
  }
  throw new Error(`message "${message}" has no PO method; add one if needed`);
}

export async function expectCreditRfqSubmitButtonWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqForm.waitForSubmitButton(seconds * 1_000);
}

export async function expectCreditRfqHasBuySellButtons(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.creditRfqForm.hasBuyAndSellButtons(),
    "credit RFQ form missing Buy/Sell buttons",
  );
}

export async function expectCreditRfqHasDirectionLabel(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.creditRfqForm.hasDirectionLabel(),
    "credit RFQ form missing Direction label",
  );
}

export async function expectSellSideHeadingWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForSellSideHeading(seconds * 1_000);
}

export async function expectCreditTradesHeadingWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
}
