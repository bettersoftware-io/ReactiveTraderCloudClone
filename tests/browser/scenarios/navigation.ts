import type { TestContext } from "../testContext.ts";

type Tab = "fx" | "credit" | "admin" | "equities";

const TAB_TIMEOUT_MS = 10_000;

/** Assert `tab` is the active tab and the URL hash names it. */
export async function expectTabRouted(
  ctx: TestContext,
  tab: Tab,
): Promise<void> {
  await ctx.po.workspace.waitTabActive(tab, TAB_TIMEOUT_MS);
  await ctx.po.workspace.waitUrlHash(`#/${tab}`, TAB_TIMEOUT_MS);
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

/** Click the browser's Back button. */
export async function pressBrowserBack(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.browserBack();
}

/** Click the browser's Forward button. */
export async function pressBrowserForward(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.browserForward();
}
