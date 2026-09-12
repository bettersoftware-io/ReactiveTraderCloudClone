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

  test("dockview edge-split drag rearranges and persists, and a collapsed panel rejects drops", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "inhouse");
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    // Centre-drop stacks blotter into the rates group (4 → 3), then an
    // EDGE drop splits it back out into a new group (3 → 4) — the count
    // only witnesses a split from a STACKED start, since moving a
    // lone-panel group elsewhere keeps the count constant.
    await layout.dragBlotterTabOntoRates(ctx);
    await layout.expectDockGroups(ctx, 3, 5);
    await layout.splitBlotterOutToTheLeft(ctx);
    await layout.expectDockGroups(ctx, 4, 5);

    // The rearranged (split, not merely stacked) tree survives a reload —
    // same re-select-the-FX-tab dance as the docking test above.
    await common.reloadPage(ctx);
    await common.clickTab(ctx, "fx");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    // A collapsed panel's strip must reject drops (group count unchanged)
    // and its restore bar must still work AFTER the rejected drop — the
    // behavioural witness that nothing was swallowed into the hidden-header
    // group.
    await layout.collapseAnalyticsPanel(ctx);
    await layout.dragBlotterOntoCollapsedAnalyticsIsRejected(ctx, 4);
    await layout.expandAnalyticsPanel(ctx);
  });
});
