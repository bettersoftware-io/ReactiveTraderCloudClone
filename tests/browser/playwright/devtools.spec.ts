import * as devtools from "../scenarios/devtools";
import { test } from "./_context";

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
  test("connects to the same-origin app and lists its streams and machines", async ({
    ctx,
  }) => {
    // This test needs a much longer budget than the 30s suite default. It is
    // uniquely expensive: it drives TWO pages (the boot-gated app HUD + a second
    // inspector page), waits out the app's boot gate + live-tile render, the
    // devtools hello/welcome handshake, a live blotter stream row, and finally a
    // heartbeat-driven "disconnected" transition after the app page closes. On a
    // slow CI runner (2 cores) the inspector — a permanently-rendering live-stream
    // view — keeps its own main thread busy enough that Playwright's click
    // actionability polling on it is slow (measured ~30s under a 4x CPU throttle),
    // so the cumulative flow can approach a minute. 120s gives honest headroom
    // without masking a genuine hang (each step below still carries its own
    // bounded per-step timeout, so a real hang fails fast and diagnostically).
    // NOTE: the inspector's under-load render cost is a tracked perf item — see
    // docs/architecture/20-devtools.md; this timeout is the CI-robustness
    // mitigation, not a fix for that.
    test.setTimeout(120_000);

    // Open the app on the FX workspace and wait for a live tile: mounting the FX
    // tiles is what births the `tileExecution` machines the inspector will show.
    await devtools.openAppOnFxWorkspace(ctx);

    // Second view, same context ⇒ same origin ⇒ BroadcastChannel pairs with the
    // app-side hub. The dev server serves the built inspector at /devtools/.
    await devtools.openInspector(ctx);

    // Connection rail badge shows the app id once the hello/welcome handshake
    // completes (it renders "disconnected" until then).
    await devtools.expectInspectorBadge(ctx, "rtc-web", 10);

    // State tab (default): a stream row for the blotter trades stream.
    await devtools.expectStreamRow(ctx, "blotter.trades$");

    // Machines tab: at least one row of kind "tileExecution", born from the FX
    // tiles mounted above. Generous click budget (60s): under CPU pressure the
    // inspector's live-stream rendering starves the click's actionability
    // polling (the slowest step by far — see the timeout note above), but this
    // still bounds a genuine hang below the whole-test timeout.
    await devtools.openMachinesTab(ctx, 60);
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
