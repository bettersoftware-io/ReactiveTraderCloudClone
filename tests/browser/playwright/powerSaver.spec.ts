import * as common from "../scenarios/common";
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
});
