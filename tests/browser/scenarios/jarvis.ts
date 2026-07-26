import type { TestContext } from "../testContext";
import { assertContains, assertGreaterThanZero } from "./assert";

const QUOTE_REPLY_FRAGMENT = "EURUSD is trading at";

/** Ask a live-desk quote question and assert the scripted brain's reply. */
export async function expectQuoteReply(ctx: TestContext): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("Where is EURUSD?");
  await ctx.po.jarvis.waitForReplyDone();
  assertContains(await ctx.po.jarvis.lastReplyText(), QUOTE_REPLY_FRAGMENT);
}

/** Ask for a confirm-gated trade, approve it, and assert it lands on the
 * blotter — reuses the existing blotter PO for row counting. */
export async function expectConfirmedTradeLandsInBlotter(
  ctx: TestContext,
): Promise<void> {
  const before = await ctx.po.blotterTable.rowCount();

  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("Buy 5M EURUSD");
  // approveConfirmation() waits for the confirm card itself before clicking.
  await ctx.po.jarvis.approveConfirmation();
  await ctx.po.jarvis.waitForReplyDone();

  const after = await ctx.po.blotterTable.rowCount();
  assertGreaterThanZero(
    after - before,
    `expected blotter row count to increase from ${before}, got ${after}`,
  );
}
