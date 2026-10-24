import type { TestContext } from "../testContext.ts";

type Tab = "fx" | "credit" | "ops" | "equities";

const TAB_TIMEOUT_MS = 10_000;

/** Assert `tab` is the active tab and the URL path names it. */
export async function expectTabRouted(
  ctx: TestContext,
  tab: Tab,
): Promise<void> {
  await ctx.po.workspace.waitTabActive(tab, TAB_TIMEOUT_MS);
  await ctx.po.workspace.waitUrlPath(`/${tab}`, TAB_TIMEOUT_MS);
}

/** Assert the FX workspace itself rendered (a live rate tile). */
export async function expectFxWorkspaceVisible(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTileLiveRate(TAB_TIMEOUT_MS);
}

/** Assert the Credit workspace itself rendered (the RFQ form). */
export async function expectCreditWorkspaceVisible(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.creditRfqForm.waitForSendButton(TAB_TIMEOUT_MS);
}
