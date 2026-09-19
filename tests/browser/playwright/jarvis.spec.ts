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
    // Task 10 (default flip): this ran under the in-house engine (the old
    // default) with no explicit switch; it now runs under dockview — the
    // NEW default — with no explicit switch either. The dockview-specific
    // variant below took over the opening-switch/closing-revert dance this
    // test used to carry.
    await jarvis.expectDockedPanelSurvivesReload(ctx);
  });

  test("docks a panel under the in-house engine, survives reload docked, then unpins", async ({
    ctx,
  }) => {
    // Task 10 (default flip): dockview becomes the default, so covering the
    // in-house docking path now needs an explicit switch — mirroring this
    // test's own OLD shape (back when it was the dockview-specific one
    // switching away from the then-default in-house engine).
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
    await layout.expectEngine(ctx, "inhouse");
    await jarvis.expectDockedPanelSurvivesReload(ctx);
    // expectDockedPanelSurvivesReload ends with the panel back in the
    // FLOATING layer (post-undock) — dismiss it so the ride leaves a clean
    // desk, mirroring the dockview-default test's own tidy ending; no
    // closing engine switch is needed (each test gets its own fresh
    // context, so there is nothing for it to restore).
    await jarvis.dismissScriptedPanel(ctx);
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
    // Runs under the default dockview engine — no forced switch needed.
    // `waitPanelMaximized` reads the engine-root `data-maximized` witness,
    // which DockviewLayoutEngine now mirrors from InhouseLayoutEngine
    // exactly (Task 10), so the ride's maximize assertion works under
    // either engine.
    await jarvis.expectNarratorDriveRideSetsUpVolWorkspace(ctx);
  });
});
