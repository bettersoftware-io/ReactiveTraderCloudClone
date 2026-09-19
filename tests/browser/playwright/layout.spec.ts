import * as common from "../scenarios/common";
import * as layout from "../scenarios/layout";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Layout engine", () => {
  withFxWorkspaceOpen();

  test("dragging a splitter handle resizes the panels", async ({ ctx }) => {
    // Task 10 (default flip): splitters are an in-house-only feature, and
    // dockview is now the default — this switch used to be implicit (the
    // in-house engine WAS the default the app booted into).
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
    await layout.expectEngine(ctx, "inhouse");
    await layout.expectSplitterDragResizes(ctx);
  });

  test("dockview tab docking persists across reload, and switching back to in-house works", async ({
    ctx,
  }) => {
    // Task 10 (default flip): dockview is now the default the app boots
    // into — the opening switch this test used to need (from the then-
    // default in-house engine) is gone; only the closing switch back to
    // in-house remains, proving the reverse direction still works.
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

  test("dockview: dragging the rail's sash resizes the rail on a fresh boot", async ({
    ctx,
  }) => {
    // Selected explicitly so the engine is CONSTRUCTED here from the seed —
    // the fresh-boot path where the rail's design pin is applied — whether or
    // not dockview is the default.
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.expectRailSashDragResizes(ctx);
  });

  test("dockview: after a pinned rail panel floats out, its partner's sash still resizes", async ({
    ctx,
  }) => {
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.expectRailSashDragResizesAfterFloatingRailMember(ctx);
  });

  test("dockview edge-split drag rearranges and persists, and a collapsed panel rejects drops", async ({
    ctx,
  }) => {
    // Task 10 (default flip): no opening switch needed — dockview is the
    // default the app boots into.
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

  test("popping a panel out opens a live child window and closing it docks the panel home", async ({
    ctx,
  }) => {
    // Pop-outs are a dockview-only feature. This test used to open by
    // switching engines, because the app booted in-house; with the default
    // flipped it boots into dockview, so the switch is gone. (The comment
    // this replaces recorded #725's revert — that flip is now re-landed,
    // with the sash carriers fixed in #737/#739 and the golden matrix
    // pinned per-scenario in #752.)
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.popoutBlotterShowsLiveContentAndDocksHomeOnClose(ctx);
  });

  test("docking a floated panel home restores its pre-float height", async ({
    ctx,
  }) => {
    // Floating groups are a dockview-only feature; dockview is what the app
    // boots into, so no opening engine switch is needed (same as the tests
    // either side).
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatBlotterAndDockHomeRestoresItsHeight(ctx);
  });

  test("a floated panel pops out and moves when dragged by its head", async ({
    ctx,
  }) => {
    // Floating groups are a dockview-only feature; dockview is what the app
    // boots into.
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatBlotterPopsOutAndMovesByItsHead(ctx);
  });

  test("a floated panel resizes from an edge and from a corner", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatBlotterResizesFromAnEdgeAndACorner(ctx);
  });

  test("a floated rail panel pops out, comes back to its float, and docks at its design width", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatedRailPanelPopsOutAndComesBack(ctx);
  });

  test("a popped-out panel's window wears the app theme and follows a light/dark switch", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.popoutBlotterFollowsTheAppTheme(ctx);
  });

  test("floating a panel grows its column sibling, survives a reload, and docks home at its pre-float height", async ({
    ctx,
  }) => {
    // Floating groups are a dockview-only feature. Like the pop-out test
    // above, no opening engine switch is needed: dockview is what the app
    // boots into. (This test was written while in-house was the default and
    // asserted an in-house boot, which the default flip made false.)
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatBlotterGrowsRatesSurvivesReloadAndDocksHome(ctx);
  });
});
