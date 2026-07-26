import type { TestContext } from "../testContext";
import { assertContains, assertGreaterThanZero } from "./assert";

const QUOTE_REPLY_FRAGMENT = "EURUSD is trading at";

/** Stable fragment of ScriptedJarvisAdapter's fill-reply copy (see
 * `handleTrade`'s reply string in ScriptedJarvisAdapter.ts) — distinctive
 * enough that only a genuine fill produces it (the decline/rejected/timeout
 * replies never contain it), so asserting on it catches a reported failure
 * that still happens to move a blotter row (or vice versa). */
const TRADE_FILLED_REPLY_FRAGMENT = "the trade is on your blotter";

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
  // A reported failure (rejected/timeout copy) sets data-done="true" too, so
  // the row-count delta alone can't distinguish it from a genuine fill —
  // pin the actual fill copy as well.
  assertContains(
    await ctx.po.jarvis.lastReplyText(),
    TRADE_FILLED_REPLY_FRAGMENT,
  );
}
