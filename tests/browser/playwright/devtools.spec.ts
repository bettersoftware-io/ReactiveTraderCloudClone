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
    // tiles mounted above.
    await devtools.openMachinesTab(ctx);
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
