import * as common from "#/browser/scenarios/common.js";
import * as equitiesChart from "#/browser/scenarios/equitiesChart.js";
import * as equitiesWatchlist from "#/browser/scenarios/equitiesWatchlist.js";
import * as fxLiveRates from "#/browser/scenarios/fxLiveRates.js";
import * as jarvis from "#/browser/scenarios/jarvis.js";
import * as jarvisOwnKey from "#/browser/scenarios/jarvisOwnKey.js";

import { test } from "./_context.js";

// All assertions below delegate to scenario helpers (or the shared
// `buildPlaywrightPageObjects()` page objects those helpers wrap) — gates
// 9-11 compliant. The authenticated-session seed lives in `./_context.ts`
// (the fullstack analogue of `browser/playwright/_context.ts`), which every
// spec in this suite shares.

/**
 * Full-stack browser happy path.
 *
 * The client under test is the real built app connected to the real backend
 * (VITE_SERVER_URL is set, so its composition root wires the WsReal adapters,
 * not the simulators). FX is the default workspace. A price tile shows
 * "Loading..." until a live price arrives over the socket, then renders the
 * SELL/BUY rate (a decimal number). So a tile whose text contains a decimal
 * proves the whole chain end to end: browser → React → presenter → WsReal
 * adapter → WebSocket → server → domain.
 */
test.describe("full-stack: live pricing renders from the real server", () => {
  test("a price tile shows a live rate streamed from the backend", async ({
    ctx,
  }) => {
    await common.openWorkspace(ctx);
    await fxLiveRates.expectFirstTileShowsLiveRateWithin(ctx, 20);
  });
});

/**
 * Regression test for the equities-over-WS gap closed in Tasks 12-13: before
 * those tasks, the server had no equities effects, so the watchlist's
 * `marketData.watchlist()` port call never resolved over WsReal and the panel
 * stayed empty. A watchlist row rendering here proves the full chain: browser
 * → React → presenter → WsReal adapter → WebSocket → server watchlist$
 * effect → EquityMarketDataSimulator.
 */
test.describe("full-stack: equities data renders from the real server", () => {
  test("the equities watchlist shows a live quote streamed from the backend", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesWatchlist.expectFirstRowShowsLiveQuoteWithin(ctx, 20);
  });
});

/**
 * Full-stack Jarvis smoke: browser → WsJarvisAdapter → WebSocket →
 * server-side ScriptedAgentLoop (RTC_JARVIS_FAKE=1, see
 * tests/fullstack/_orchestration.ts) → real execution → wire → UI, in one
 * spec. Same testids as the P1 browser-tier page object
 * (tests/browser/page-objects/playwright/Jarvis.ts) and scenario
 * (tests/browser/scenarios/jarvis.ts) — this spec reuses that same page
 * object + scenario layer via `buildPlaywrightPageObjects()`.
 *
 * Replies stream (server paces deltas ~26ms apart after ~1s reference-data
 * delay + snapshot reads) and the EURUSD fill can take up to ~2s after
 * approve, so every assertion below is a generous toContainText poll —
 * never a fixed sleep (see the flake postmortem banning sleep-vs-random-delay
 * races).
 */
test.describe("full-stack: jarvis chat + confirm-gated execution over the real wire", () => {
  test("answers a live-desk quote, then executes a confirm-gated trade onto the blotter", async ({
    ctx,
  }) => {
    await common.openWorkspace(ctx);

    // NOT a proof of the subscribe -> availability round-trip: JarvisMachine's
    // INITIAL.available is `true` (see packages/client-core-rxjs's JarvisMachine),
    // so the orb renders on mount regardless of whether jarvis.subscribe /
    // jarvis.availability ever complete — this assertion only proves the orb
    // isn't hidden by an EARLY `available:false` landing before the click
    // below. The positive handshake (a real jarvis.subscribe ->
    // jarvis.availability {available:true} against the server's
    // ScriptedAgentLoop, RTC_JARVIS_FAKE=1) is witnessed at the
    // adapter/machine layers instead (see WsJarvisAdapter's and
    // JarvisMachine's own unit tests). A fullstack case where the server
    // reports unavailable and the orb actually hides can no longer be written
    // the way it was once planned: with no ANTHROPIC_API_KEY the server now
    // stays available on the scripted brain (B3c D16), so it never sends an
    // unavailable availability frame for a signed-in caller.
    await jarvis.expectOrbVisibleWithin(ctx, 20);

    await jarvis.openViaOrb(ctx);
    await jarvis.expectOverlayVisible(ctx);

    // Turn 1: a live-desk quote question, answered from real server-side
    // price state. The reply is excluded-narrator (belt-and-braces on top of
    // the narrator-off seed in ./_context.ts): even with that seed, this
    // stays the last REPLY entry rather than an unsolicited proactive
    // narration turn that happened to land after it.
    await jarvis.askAndExpectReplyContainsThenDone(
      ctx,
      "Where is EURUSD?",
      "EURUSD is trading at",
      20,
    );

    // Turn 2: a confirm-gated trade — approve, then assert the fill reply
    // (not just any terminal reply: the rejected/timeout copy also flips
    // data-done, so pinning this exact fragment catches a reported failure
    // that still happens to move a blotter row, or vice versa).
    await jarvis.askApproveAndExpectReplyContains(
      ctx,
      "Buy 5M EURUSD",
      "the trade is on your blotter",
      20,
    );
  });
});

/**
 * A person's own key across a real browser and a real server. The server
 * runs with RTC_JARVIS_FAKE=1: a key starting `fake-good` is accepted, any
 * other is refused, and the own loop is the scripted one, so no provider is
 * ever called. This is the only test that drives the whole path: the
 * Preferences form, `useJarvisOwnKey`, the presenter, the adapter's
 * `jarvis.key` frame, the server's check, the offered own brains, a turn run
 * on that key, the browser store, and the wipe at sign-out.
 */
test.describe("full-stack: a person's own key over the real wire", () => {
  test("accepts a key, keeps it across a reload, runs a turn on it, and leaves none in the browser after sign-out", async ({
    ctx,
  }) => {
    // Obviously fake, and never a real key.
    const fakeKey = "fake-good-e2e-not-a-real-key";
    const ownBrain = "own:anthropic:claude-haiku-4-5";

    await common.openWorkspace(ctx);
    await jarvis.expectOrbVisibleWithin(ctx, 20);

    await jarvisOwnKey.openPreferences(ctx);
    await jarvisOwnKey.saveKeyAndExpectAccepted(ctx, fakeKey);
    await jarvisOwnKey.closePreferences(ctx);

    await ctx.po.workspace.reload();
    await jarvis.expectOrbVisibleWithin(ctx, 20);
    await jarvisOwnKey.openPreferences(ctx);
    await jarvisOwnKey.expectKeyRestoredAndAccepted(ctx);
    await jarvisOwnKey.chooseOwnBrain(ctx, ownBrain);
    await jarvisOwnKey.closePreferences(ctx);

    await jarvisOwnKey.expectReplyRanOnBrain(ctx, "Claude Haiku 4.5");

    await jarvisOwnKey.signOutAndExpectNoKeyInStorage(ctx);
  });
});
