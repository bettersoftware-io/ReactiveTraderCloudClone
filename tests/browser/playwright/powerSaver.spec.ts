import * as common from "../scenarios/common";
import * as powerSaver from "../scenarios/powerSaver";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

test.describe("Power saver", () => {
  withWorkspaceOpen();

  test("quick toggle flips the document flag", async ({ ctx }) => {
    await powerSaver.expectDocumentFlag(ctx, "false");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "true");
  });

  test("power saver persists across reload", async ({ ctx }) => {
    await powerSaver.clickQuickToggle(ctx);
    await common.reloadPage(ctx);
    await powerSaver.expectDocumentFlag(ctx, "true");
  });
});
