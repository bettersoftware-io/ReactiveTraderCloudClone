import type { TestContext } from "../testContext";
import {
  assertContains,
  assertFalse,
  assertGreaterThanZero,
  assertTrue,
} from "./assert";

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

/** Deterministic id the scripted brain's showPanel/restylePanel turns always
 * use this session (see `SCRIPTED_PANEL_ID` in ScriptedJarvisEngine.ts) —
 * a single-panel demo (generative-UI Round 1), so one constant id suffices. */
const SCRIPTED_PANEL_ID = "panel-scripted-1";

/**
 * Rides the scripted generative-UI panel end to end: a showPanel turn spawns
 * a live line-chart panel that survives closing the chat overlay (the panel
 * layer is the overlay's SIBLING, not its child); a restylePanel turn swaps
 * the SAME panel (same `data-panel-id`) to a heatmap; dismissing it removes
 * it (and the whole panel layer, since this demo is single-panel).
 */
export async function expectPanelSurvivesOverlayCloseAndRestylesToHeatmap(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("show me gbp volatility");
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForPanelLineRenderer(SCRIPTED_PANEL_ID);
  // Wait for the turn to fully settle before closing/reopening the overlay
  // and starting the next turn — same reason the other scenarios in this
  // file wait for it before acting again.
  await ctx.po.jarvis.waitForReplyDone();

  // Closing the chat overlay must not tear the panel down — it lives on the
  // overlay's sibling layer.
  await ctx.po.jarvis.closeViaButton();
  assertFalse(
    await ctx.po.jarvis.isOverlayVisible(),
    "expected the overlay to actually close",
  );
  assertTrue(
    await ctx.po.jarvis.isPanelPresent(SCRIPTED_PANEL_ID),
    "expected the panel to survive closing the chat overlay",
  );

  // Reopen and restyle — same panel id, new viz.
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("make it a heatmap");
  await ctx.po.jarvis.waitForPanelHeatmapRenderer(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForReplyDone();
  assertContains(await ctx.po.jarvis.lastReplyText(), "Restyled as a heatmap");

  // The full-screen overlay dims/covers the desk (and the panel cascade sits
  // on the desk, not inside the overlay) — close it first, same as a real
  // trader would, so the dismiss click actually reaches the panel's own
  // button instead of the overlay's stage intercepting the pointer event.
  await ctx.po.jarvis.closeViaButton();
  await ctx.po.jarvis.dismissPanel(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForNoPanels();
}
