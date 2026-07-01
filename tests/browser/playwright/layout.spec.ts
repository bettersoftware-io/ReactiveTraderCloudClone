import * as layout from "../scenarios/layout";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Layout engine", () => {
  withFxWorkspaceOpen();

  test("dragging a splitter handle resizes the panels", async ({ ctx }) => {
    await layout.expectSplitterDragResizes(ctx);
  });
});
