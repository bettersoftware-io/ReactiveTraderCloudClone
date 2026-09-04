import type { TestContext } from "../testContext";
import {
  assertContains,
  assertEquals,
  assertFalse,
  assertGreaterThanZero,
  assertTrue,
} from "./assert";
import * as common from "./common";

const QUOTE_REPLY_FRAGMENT = "EURUSD is trading at";

/** Stable fragment of ScriptedJarvisAdapter's fill-reply copy (see
 * `handleTrade`'s reply string in ScriptedJarvisAdapter.ts) — distinctive
 * enough that only a genuine fill produces it (the decline/rejected/timeout
 * replies never contain it), so asserting on it catches a reported failure
 * that still happens to move a blotter row (or vice versa). */
const TRADE_FILLED_REPLY_FRAGMENT = "the trade is on your blotter";

/** Round-trips the demo guide: open it, click a catalog command row (the
 * SAME quote question `expectQuoteReply` types by hand), and assert the
 * scripted brain answers exactly as it would for a typed turn — proving the
 * guide row is a genuine shortcut, not a separate/divergent code path. */
export async function expectGuideCommandRoundTrip(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.openGuide();
  await ctx.po.jarvis.clickGuideCommand("Where is EURUSD?");
  await ctx.po.jarvis.waitForReplyDone();
  assertContains(await ctx.po.jarvis.lastReplyText(), QUOTE_REPLY_FRAGMENT);
}

/**
 * Starts the hands-free full demo from the footer's ▶ RUN FULL DEMO button
 * and stops it. Proves boot-to-browser wiring only — the full 7-step script
 * is machine-tier coverage (`JarvisDemoMachine.test.ts`); waiting for step 2
 * (`waitForDemoStep(2)`) is the cheapest witness that step 1's own scripted
 * turn (a real end-to-end typed-reveal reply) settled and the fold advanced,
 * without paying for all 7 steps in an e2e ride. Stopping and asserting
 * `demoProgress()` is `null` proves the STOP affordance actually halts the
 * run rather than merely hiding it.
 */
export async function expectFullDemoStartsAndStops(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.startFullDemo();
  await ctx.po.jarvis.waitForDemoStep(2); // proves step 1 completed end-to-end
  await ctx.po.jarvis.stopFullDemo();
  assertEquals(await ctx.po.jarvis.demoProgress(), null);
}

/**
 * Wait for the header orb to be visible — the fullstack real-backend
 * smoke's boot witness (NOT a subscribe → availability round-trip proof;
 * see the fullstack spec's own doc comment for why that positive handshake
 * is witnessed at the adapter/machine layers instead).
 */
export async function expectOrbVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.jarvis.waitForOrbVisible(seconds * 1_000);
}

/** Click the header orb to open the overlay. */
export async function openViaOrb(ctx: TestContext): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
}

/** Wait for the full-screen overlay to become visible. */
export async function expectOverlayVisible(ctx: TestContext): Promise<void> {
  await ctx.po.jarvis.waitForOverlayVisible();
}

/**
 * Ask `question`, wait for the last non-narrator jarvis-role entry to
 * CONTAIN `fragment`, then wait for that same entry's typed reveal to
 * finish (`data-done` flips to "true"). Used by the fullstack real-backend
 * smoke's first turn, against the real server's live desk state.
 */
export async function askAndExpectReplyContainsThenDone(
  ctx: TestContext,
  question: string,
  fragment: string,
  seconds: number,
): Promise<void> {
  await ctx.po.jarvis.ask(question);
  await ctx.po.jarvis.waitForNonNarratorReplyContains(
    fragment,
    seconds * 1_000,
  );
  await ctx.po.jarvis.waitForNonNarratorReplyDone(seconds * 1_000);
}

/**
 * Ask `question`, approve the resulting confirm-gated trade card, then wait
 * for the last non-narrator jarvis-role entry to CONTAIN `fragment` — used
 * by the fullstack real-backend smoke's second (execution) turn.
 */
export async function askApproveAndExpectReplyContains(
  ctx: TestContext,
  question: string,
  fragment: string,
  seconds: number,
): Promise<void> {
  await ctx.po.jarvis.ask(question);
  await ctx.po.jarvis.approveConfirmation();
  await ctx.po.jarvis.waitForNonNarratorReplyContains(
    fragment,
    seconds * 1_000,
  );
}

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

/**
 * Docks the scripted GBP-volatility panel into the workspace, reloads the
 * page, and asserts it rehydrates DOCKED and live — proving
 * `workspaceLayoutV1` persistence round-trips a real desk panel, not just
 * the static tab layout. Finishes by unpinning it and asserting it lands
 * back in the floating layer, so both halves of the dock/undock round trip
 * are witnessed in one ride.
 */
export async function expectDockedPanelSurvivesReload(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("show me gbp volatility");
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForReplyDone();

  // The full-screen overlay dims/covers the desk (and the panel cascade sits
  // on the desk, not inside the overlay) — close it first, same as
  // `expectPanelSurvivesOverlayCloseAndRestylesToHeatmap` above does for its
  // dismiss click, so the dock click actually reaches the panel's own
  // button instead of the overlay's stage intercepting the pointer event.
  await ctx.po.jarvis.closeViaButton();

  // dockPanel() itself waits for the debounced workspace-layout write to
  // land before returning — see its doc in the playwright driver — so the
  // reload right below never races WorkspacePersistenceWriter's debounce.
  await ctx.po.jarvis.dockPanel(SCRIPTED_PANEL_ID);
  assertTrue(
    await ctx.po.jarvis.isPanelDocked(SCRIPTED_PANEL_ID),
    "expected the panel to be docked before reload",
  );

  await common.reloadPage(ctx);

  await ctx.po.jarvis.waitForPanelDockedLive(SCRIPTED_PANEL_ID);
  assertTrue(
    await ctx.po.jarvis.isPanelDocked(SCRIPTED_PANEL_ID),
    "expected the panel to rehydrate docked after reload",
  );

  await ctx.po.jarvis.undockPanel(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  assertFalse(
    await ctx.po.jarvis.isPanelDocked(SCRIPTED_PANEL_ID),
    "expected the panel to return to the floating layer after undock",
  );
}

/** The layout panel id the scripted vol-workspace drive batch maximizes
 * (see `SCRIPTED_VOL_WORKSPACE_BATCH` in ScriptedJarvisEngine.ts). */
const EQ_CHART_PANEL_ID = "eq-chart";

/** `SCRIPTED_VOL_WORKSPACE_BATCH` has 5 commands (switchTab, layout,
 * eqTimeframe, eqIndicator, eqPane) and every one of them applies cleanly
 * against a fresh session — see `applyCommand`'s skip conditions in
 * JarvisDriverMachine.ts (none of them can fire here: the tab/panel/
 * indicator/pane ids are all real, and nothing has toggled ema50/rsi yet). */
const EXPECTED_DRIVE_ROW_COUNT = 5;

const LAYOUT_MAXIMIZE_TIMEOUT_MS = 15_000;
const INDICATOR_ACTIVE_TIMEOUT_MS = 15_000;
const PANE_VISIBLE_TIMEOUT_MS = 15_000;

/**
 * The flagship narrator + drive-the-app ride. Launches with the dev-only
 * `?narratorThresholds=test` seam so a proactive narration fires within
 * seconds of live sim ticks (instead of the simulator's natural ~14 min
 * anomaly interval — see NarratorMachine.ts), waits for the header orb to
 * flare (the narration turn completed while the overlay was still closed),
 * opens the overlay, and replies with the scripted `setupWorkspace` trigger
 * phrase. `streamSetupWorkspaceReply` (ScriptedJarvisEngine.ts) does THREE
 * things in that one turn: reveals the setup copy, emits the
 * `SCRIPTED_VOL_WORKSPACE_BATCH` command batch, and ALSO spawns the same
 * canned GBP-volatility desk panel the other ride in this file exercises —
 * which is why `panel-scripted-1` being present is part of this assertion
 * set even though nothing here asked for a panel explicitly.
 *
 * Finishes by asserting the narration cooldown held: exactly one
 * narrator-origin transcript entry, not a second one. `NARRATION_COOLDOWN_MS`
 * is 5 minutes — far longer than this ride takes — so a bounded post-ride
 * count is the honest witness here, not a long wait for a cooldown that
 * cannot possibly have expired yet.
 */
export async function expectNarratorDriveRideSetsUpVolWorkspace(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.workspace.openWithNarratorThresholds();

  // The narration turn completes (and the orb flares) while the overlay is
  // still closed — entries only render once state.open is true, so the orb
  // is the one witness available before opening it.
  await ctx.po.jarvis.waitForNarrationFlare();

  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("set up the vol workspace");

  // The scripted setupWorkspace turn's own streamShowPanelReply spawns this
  // panel mid-turn — see the doc comment above.
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForReplyDone();

  assertTrue(
    await ctx.po.workspace.isTabActive("equities"),
    "expected the equities tab to be active after the drive batch's switchTab command",
  );

  await ctx.po.layout.waitPanelMaximized(
    EQ_CHART_PANEL_ID,
    LAYOUT_MAXIMIZE_TIMEOUT_MS,
  );
  await ctx.po.equitiesChart.waitIndicatorActive(
    "ema50",
    INDICATOR_ACTIVE_TIMEOUT_MS,
  );
  await ctx.po.equitiesChart.waitPaneVisible("rsi", PANE_VISIBLE_TIMEOUT_MS);

  assertTrue(
    await ctx.po.jarvis.isPanelPresent(SCRIPTED_PANEL_ID),
    "expected the GBP-volatility desk panel to be present after the setupWorkspace turn",
  );

  await ctx.po.jarvis.waitForDriveRowCount(EXPECTED_DRIVE_ROW_COUNT);

  assertEquals(
    await ctx.po.jarvis.narrationEntryCount(),
    1,
    "expected exactly one narrator-origin entry — the cooldown must hold for the ride's whole duration",
  );
}
