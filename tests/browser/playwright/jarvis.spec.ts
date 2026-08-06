import * as jarvis from "../scenarios/jarvis";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Jarvis assistant", () => {
  withFxWorkspaceOpen();

  test("answers a quote from live desk state", async ({ ctx }) => {
    await jarvis.expectQuoteReply(ctx);
  });

  test("executes a confirm-gated trade into the blotter", async ({ ctx }) => {
    await jarvis.expectConfirmedTradeLandsInBlotter(ctx);
  });

  test("rides a scripted generative-UI panel: spawn, survive overlay close, restyle to heatmap, dismiss", async ({
    ctx,
  }) => {
    await jarvis.expectPanelSurvivesOverlayCloseAndRestylesToHeatmap(ctx);
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
