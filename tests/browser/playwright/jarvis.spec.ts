import * as jarvis from "../scenarios/jarvis";
import * as layout from "../scenarios/layout";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Jarvis assistant", () => {
  withFxWorkspaceOpen();

  test("answers a quote from live desk state", async ({ ctx }) => {
    await jarvis.expectQuoteReply(ctx);
  });

  test("demo guide: opening it and clicking a command round-trips the same reply as typing it", async ({
    ctx,
  }) => {
    await jarvis.expectGuideCommandRoundTrip(ctx);
  });

  test("full demo: RUN FULL DEMO advances past step 1, STOP halts it", async ({
    ctx,
  }) => {
    // The typed-reveal pacing alone (26ms/chunk) makes step 1's reply take
    // several real seconds before step 2 can even start — same generous
    // headroom as the flagship narrator ride below.
    test.setTimeout(45_000);
    await jarvis.expectFullDemoStartsAndStops(ctx);
  });

  test("executes a confirm-gated trade into the blotter", async ({ ctx }) => {
    await jarvis.expectConfirmedTradeLandsInBlotter(ctx);
  });

  test("rides a scripted generative-UI panel: spawn, survive overlay close, restyle to heatmap, dismiss", async ({
    ctx,
  }) => {
    await jarvis.expectPanelSurvivesOverlayCloseAndRestylesToHeatmap(ctx);
  });

  test("docks a panel, survives reload docked and live, then unpins back to floating", async ({
    ctx,
  }) => {
    await jarvis.expectDockedPanelSurvivesReload(ctx);
  });

  test("docks a panel under the dockview engine, survives reload docked, then unpins", async ({
    ctx,
  }) => {
    // Task 10 (default flip) inverts this: when dockview becomes the
    // default, the opening switch goes away and the in-house journey gains
    // one instead.
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await jarvis.expectDockedPanelSurvivesReload(ctx);
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
  });

  test("flagship ride: narrator flare -> setupWorkspace drive batch assembles the vol workspace, cooldown holds", async ({
    ctx,
  }) => {
    // Waiting for the narrator's proactive flare is a genuine wall-clock
    // cost (a handful of real sim ticks per FX symbol, even with the
    // relaxed ?narratorThresholds=test seam — see waitForNarrationFlare's
    // doc), on top of the ride's own several generous per-step polls —
    // ample headroom over the default 30s, same precedent as
    // devtools.spec.ts's coalesced-stream test.
    test.setTimeout(45_000);
    await jarvis.expectNarratorDriveRideSetsUpVolWorkspace(ctx);
  });
});
