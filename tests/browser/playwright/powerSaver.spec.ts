import * as common from "../scenarios/common";
import * as connection from "../scenarios/connection";
import * as powerSaver from "../scenarios/powerSaver";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

test.describe("Power saver", () => {
  withWorkspaceOpen();

  test("cycling control advances the document flag off -> calm -> freeze -> off", async ({
    ctx,
  }) => {
    await powerSaver.expectDocumentFlag(ctx, "off");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "calm");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "freeze");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "off");
  });

  test("power saver persists across reload", async ({ ctx }) => {
    await powerSaver.clickQuickToggle(ctx);
    await common.reloadPage(ctx);
    await powerSaver.expectDocumentFlag(ctx, "calm");
  });

  // jsdom (the contract tier) never loads index.css and cannot resolve
  // `!important` cascade, so the Freeze tier's CSS catch-all — the mechanism
  // that actually neutralises decorative motion — is only provable in a real
  // browser. This proves the catch-all specifically (a collapsed
  // `animation-duration`), not Calm's `--fx-play` pause (which only changes
  // play-state, never duration).
  test("freeze's CSS catch-all collapses animation-duration in a real browser", async ({
    ctx,
  }) => {
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");
    await powerSaver.expectConnectionDotAnimating(ctx);

    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "calm");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "freeze");

    await powerSaver.expectConnectionDotFrozen(ctx);
  });

  // The churn gate, distinct from the catch-all test above: computed styles
  // can look frozen while data-driven retriggers still spawn a 0.01ms
  // Animation (plus a style recalc) per quote — manufactured transitions,
  // flash keyframes, paused resident loops, ungated rAF. Only a live
  // streaming app can witness those; the visual tier's freeze contract runs
  // against static fixtures.
  test("freeze leaves no animation or rAF churn while quotes stream", async ({
    ctx,
  }) => {
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");

    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "freeze");

    await powerSaver.expectNoLiveMotionMachinery(ctx);
  });
});
