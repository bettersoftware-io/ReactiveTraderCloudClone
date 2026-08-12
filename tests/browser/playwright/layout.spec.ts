import * as common from "../scenarios/common";
import * as layout from "../scenarios/layout";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Layout engine", () => {
  withFxWorkspaceOpen();

  test("dragging a splitter handle resizes the panels", async ({ ctx }) => {
    await layout.expectSplitterDragResizes(ctx);
  });

  test("switching the layout engine to dockview enables tab docking that persists across reload, and back", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "inhouse");

    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.dragBlotterTabOntoRates(ctx);
    await layout.expectDockGroups(ctx, 3, 5);

    // A plain page reload always lands back on the default tab — the tab
    // choice isn't URL-encoded (see WorkspacePO.openFx's own goto("/") +
    // click) — so the FX tab must be re-selected before re-asserting the
    // FX-scoped layout engine below (mirrors fxLiveRates.spec.ts's
    // "preference persists across reloads" test).
    await common.reloadPage(ctx);
    await common.clickTab(ctx, "fx");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 3, 5); // the docked layout was persisted

    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
    await layout.expectEngine(ctx, "inhouse");
  });
});
