import * as devtools from "../scenarios/devtools";
import * as fxTrading from "../scenarios/fxTrading";
import { test } from "./_context";

// Same client-selection env var playwright.config.ts branches on. The two
// app-side devtoolsHub.ts files intentionally use different appId values
// (packages/client-react/src/app/devtools/devtoolsHub.ts: "rtc-web";
// packages/client-solid/src/app/devtools/devtoolsHub.ts: "rtc-web-solid") so
// two same-origin inspectors from different clients are distinguishable —
// the connection badge the app-side hub reports is client-specific too.
const expectedAppId =
  process.env.RTC_CLIENT_PKG === "@rtc/client-solid"
    ? "rtc-web-solid"
    : "rtc-web";

// The inspector is served at /devtools/ FROM the app's own origin (client-react
// Vite middleware in dev, dist/devtools in prod). That is load-bearing: the
// devtools transport is a same-origin BroadcastChannel, so a second view in the
// SAME browser context — as the `inspector` page object opens — pairs with the
// app-side hub, whereas a standalone dev server on another port never could.
// This spec therefore joins the EXISTING playwright suite (one dev server, one
// browser context) rather than spinning up its own runner. The second-view
// mechanics live entirely in the inspector page object + devtools scenario, so
// this body stays driver-free (no raw `expect`, no direct page handle).
test.describe("DevTools inspector (same-origin)", () => {
  test("connects to the same-origin app, scopes by store, clears, and lists machines", async ({
    ctx,
  }) => {
    // A longer budget than the 30s suite default: this test drives TWO pages
    // (the boot-gated app HUD + a second inspector page), waiting out the app's
    // boot gate + live-tile render, the devtools hello/welcome handshake, a live
    // blotter stream row, and a "disconnected" transition after the app closes.
    // The inspector now coalesces + throttles its repaint to ~15 Hz
    // (InspectorStore.FRAMES_PER_FLUSH), so it no longer starves its own main
    // thread under a live stream — the actionability-polling stall that used to
    // dominate this test (~30s under a 4x CPU throttle) is gone, and 45s is
    // ample even on a slow 2-core runner. Each step still carries its own
    // bounded per-step timeout so a genuine hang fails fast and diagnostically.
    test.setTimeout(45_000);

    // Open the app on the FX workspace and wait for a live tile: mounting the FX
    // tiles is what births the `tileExecution` machines the inspector will show.
    await devtools.openAppOnFxWorkspace(ctx);

    // Second view, same context ⇒ same origin ⇒ BroadcastChannel pairs with the
    // app-side hub. The dev server serves the built inspector at /devtools/.
    await devtools.openInspector(ctx);

    // Connection rail badge shows the app id once the hello/welcome handshake
    // completes (it renders "disconnected" until then).
    await devtools.expectInspectorBadge(ctx, expectedAppId, 10);

    // Following live under All: the context pane's state tree shows a stream
    // row for the blotter trades stream.
    await devtools.expectStreamRow(ctx, "blotter.trades$");

    // DEVIATION from the task brief: the brief assumed "the simulator emits
    // blotter.activity$ continuously", but the blotter presenter's streams
    // (trades$/newTradeIds$/activity$ — packages/client-react/src/app/devtools/presenterManifest.ts)
    // are all synchronously derived from BlotterPresenter.trades$, which is
    // execution-triggered, not periodic: ExecutionSimulator.executeTrade only
    // fires on demand and TradeStoreSimulator carries no timer (see
    // packages/domain/src/simulators/{ExecutionSimulator,TradeStoreSimulator}.ts).
    // DevtoolsHub also only turns a registered stream's activity into LOG rows
    // once it is "live" (an inspector has connected) — a presenter singleton
    // constructed at app boot, before the inspector opens, delivers its one
    // pre-existing value into the WELCOME SNAPSHOT (which is what makes
    // expectStreamRow above pass) rather than as a discrete stream:emission
    // row. Net effect: without a live trade, presenter:blotter's scoped list
    // stays at zero rows forever — widening the wait (the brief's suggested
    // fix for a suspected flake) cannot help. Execute one real trade here so
    // devtools observes a genuine post-connect emission; expectTradeConfirmationMatchesOneOf
    // polls to a terminal status, which is deterministic and pair-agnostic
    // (works whether the first tile happens to be a normal, rejected, or
    // delayed pair).
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i",
      10_000,
    );

    // Store-first scoping (spec §3): pick the blotter presenter in the tree
    // and only its rows are listed. Row summaries carry the stream id, so a
    // text assertion is exact.
    await devtools.selectNavNode(ctx, "presenter:blotter", 15);
    await devtools.expectOnlyRowsContaining(ctx, "blotter.");

    // Back to All for the pin journey (blotter traffic is sparse; the pin
    // step wants a busy tail).
    await devtools.selectNavNode(ctx, "all", 15);

    // Timeline pin-and-inspect journey: pin the newest row (ArrowUp — the
    // deterministic way to grab a moment out of a live tail), confirm the
    // inspector freezes at that moment, and Esc resumes the live tail.
    await devtools.pinLatestTimelineRow(ctx);
    await devtools.expectPinnedBar(ctx);
    await devtools.resumeViaEscape(ctx);
    await devtools.expectNoPinnedBar(ctx);

    // Clear (spec §5): everything before now is hidden; the list refills
    // with strictly newer rows and Unclear is offered.
    const watermark = await devtools.clearTimeline(ctx);
    await devtools.expectTimelineClearedPast(ctx, watermark);

    // Machines branch: the tileExecution kind node exists once the FX tiles
    // have birthed their machines; selecting it lists that kind's instances
    // in the State tab.
    await devtools.selectNavNode(ctx, "machineKind:tileExecution", 15);
    await devtools.expectMachineOfKind(ctx, "tileExecution");

    // Closing the app view fires `pagehide` on its window, which the app-side
    // devtoolsHub (packages/client-react/src/app/devtools/devtoolsHub.ts)
    // handles by calling `dispose()` → `goDormant()` → sends `bye` over the
    // BroadcastChannel. The inspector has no independent liveness timer (an
    // abrupt crash with no `pagehide` is a documented v1 limitation — see
    // design spec §5), but a graceful close is exactly this path. Generous
    // timeout: teardown + channel delivery + the panel's flush cadence.
    await devtools.closeApp(ctx);
    await devtools.expectInspectorBadge(ctx, "disconnected", 15);
  });
});
