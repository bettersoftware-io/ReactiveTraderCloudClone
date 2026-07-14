import { expect } from "@playwright/test";

import * as common from "../scenarios/common";
import { test } from "./_context";

// The inspector is served at /devtools/ FROM the app's own origin (client-react
// Vite middleware in dev, dist/devtools in prod). That is load-bearing: the
// devtools transport is a same-origin BroadcastChannel, so a second page in the
// SAME browser context — as opened here — pairs with the app-side hub, whereas a
// standalone dev server on another port never could. This spec therefore joins
// the EXISTING playwright suite (one dev server, one browser context) rather
// than spinning up its own runner.
test.describe("DevTools inspector (same-origin)", () => {
  test("connects to the same-origin app and lists its streams and machines", async ({
    ctx,
    page,
  }) => {
    // Open the app on the FX workspace and wait for a live tile: mounting the FX
    // tiles is what births the `tileExecution` machines the inspector will show.
    await common.openFxWorkspace(ctx);
    await expect(page.locator('[data-testid^="tile-"]').first()).toBeVisible();

    // Second page, same context ⇒ same origin ⇒ BroadcastChannel pairs with the
    // app-side hub. The dev server serves the built inspector at /devtools/.
    const inspector = await page.context().newPage();
    await inspector.goto("/devtools/");

    // Connection rail badge shows the app id once the hello/welcome handshake
    // completes (it renders "disconnected" until then).
    await expect(inspector.getByTestId("connection-badge")).toHaveText(
      "rtc-web",
    );

    // State tab (default): a stream row for the blotter trades stream.
    await expect(
      inspector
        .getByTestId("devtools-stream-row")
        .filter({ hasText: "blotter.trades$" }),
    ).toBeVisible();

    // Machines tab: at least one row of kind "tileExecution", born from the FX
    // tiles mounted above.
    await inspector.getByRole("button", { name: "Machines" }).click();
    await expect(
      inspector
        .getByTestId("devtools-machine-row")
        .filter({ hasText: "tileExecution" })
        .first(),
    ).toBeVisible();

    // NB no "app closes ⇒ inspector shows disconnected" assertion: in the v1
    // (observe-only) protocol the inspector flips to "disconnected" ONLY on an
    // explicit `bye`, and the 10s heartbeat timeout lives on the HUB (it detects
    // the inspector's pings stopping, then it sends the `bye`). An abruptly
    // closed APP page emits no `bye`, and the panel has no independent liveness
    // timer, so the badge would stay "connected". Surfacing an app-gone state
    // would need an app-side pagehide→hub.dispose() (or an inspector-side welcome
    // freshness timeout) — a protocol/lifecycle change outside this serving task.
  });
});
