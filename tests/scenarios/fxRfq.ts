import type { TestContext } from "../support/testContext";

export async function expectRfqInitiationButtonWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.fxRfqForm.waitForRfqButton(seconds * 1_000);
}

export async function clickRfqInitiationButton(ctx: TestContext): Promise<void> {
  await ctx.po.fxRfqForm.clickInitiateRfq();
}

export async function expectCountdownOrQuoteWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.fxRfqForm.waitForCountdownOrQuote(seconds * 1_000);
}
