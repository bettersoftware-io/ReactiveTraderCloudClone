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
});
