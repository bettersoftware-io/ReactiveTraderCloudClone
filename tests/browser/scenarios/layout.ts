import type { PrefsLayoutEngine } from "../page-objects/contracts/Preferences";
import { TESTIDS } from "../page-objects/contracts/testids";
import type { TestContext } from "../testContext";
import {
  assertEquals,
  assertFalse,
  assertGreaterThanZero,
  assertGte,
  assertLte,
  assertTrue,
} from "./assert";
import * as common from "./common";

// Drag the first splitter boundary a healthy distance along its axis; large
// enough that the resulting size-fraction change clears the assertion margin
// regardless of the exact container width.
const DRAG_PX = -140;
const MIN_FRACTION_DELTA = 0.02;

// A preference switch remounts InhouseLayoutEngine/DockviewLayoutEngine
// (App.tsx's `engine === "dockview"` ternary) — near-instant, but still a
// poll rather than an instant read.
const ENGINE_SWITCH_TIMEOUT_MS = 3_000;

// PANEL_SPECS' fx-blotter panel id
// (packages/client-core/src/layout/defaultLayoutPort.ts) — the dockview
// tab is located by the panel's own head-slot mount inside it
// (`TESTIDS.layout.dockTab`), not by a label: the tab shows the panel's
// header, which for the blotter is its "FX Blotter" / "Activity" sub-tabs.
const BLOTTER_PANEL_ID = "fx-blotter";

// FX_ROOT's left-hand column stacks fx-rates (0.66) over fx-blotter (0.34)
// (packages/client-core/src/layout/defaultLayoutPort.ts) — fx-rates is the
// column sibling that should grow once fx-blotter floats out of it.
const RATES_PANEL_ID = "fx-rates";

// The FX rates panel's own content carries no testid of its own; its
// CurrencyFilter row (LiveRatesPanel.tsx) is always mounted (no view-mode
// toggle hides it) and stable, so it stands in as the drop target.
const RATES_PANEL_DROP_TARGET: string = TESTIDS.liveRates.currencyFilter;

/**
 * Proves the layout engine's DOM-geometry pointer-drag actually resizes panels:
 * grab the first splitter handle, drag it, and assert its size fraction
 * (`aria-valuenow`) moved. This is the one engine path no unit/contract test
 * covers (the reducer maths is unit-tested; the drag wiring is not).
 */
export async function expectSplitterDragResizes(
  ctx: TestContext,
): Promise<void> {
  assertGreaterThanZero(
    await ctx.po.layout.resizeHandleCount(),
    "expected at least one draggable splitter handle in the FX layout",
  );

  const before = await ctx.po.layout.firstResizeHandleSize();
  await ctx.po.layout.dragFirstHandleBy(DRAG_PX);
  const after = await ctx.po.layout.firstResizeHandleSize();

  assertTrue(
    Math.abs(after - before) > MIN_FRACTION_DELTA,
    `expected the splitter size fraction to change by more than ${MIN_FRACTION_DELTA} after dragging (before=${before}, after=${after})`,
  );
}

// The FX rail's top panel (PANEL_SPECS' fx-analytics). The rail is seeded
// with a 360px design pin, held as min=max group constraints.
const RAIL_PANEL_ID = "fx-analytics";
// Dragging the rail's sash LEFT by this much must grow the rail by nearly as
// much. The bar sits well above px noise but far below a full drag, so it
// only distinguishes "moved" from "did not move at all".
const RAIL_DRAG_PX = -140;
const MIN_RAIL_GROWTH_PX = 100;

/**
 * Proves a user can resize the dockview rail by dragging its sash on a FRESH
 * boot — the engine constructed from the seed, with the rail's design pin
 * applied. The pin is min=max, which dockview reads as "this side cannot
 * move" and disables the sash; the engine releases it on the first move of a
 * sash drag. That release once loosened the rail's groups but left dockview's
 * cached branch limits at the pinned width, so the rail never moved, while
 * the same drag under the in-house engine moved it on the first try.
 *
 * jsdom cannot see this — dockview's sash wiring (Resizable) does not run
 * there — so only a real browser drag is a witness.
 */
export async function expectRailSashDragResizes(
  ctx: TestContext,
): Promise<void> {
  const before = await ctx.po.layout.dockPanelWidth(RAIL_PANEL_ID);
  await ctx.po.layout.dragDockSashLeftOf(RAIL_PANEL_ID, RAIL_DRAG_PX);
  const after = await ctx.po.layout.dockPanelWidth(RAIL_PANEL_ID);

  assertTrue(
    after - before > MIN_RAIL_GROWTH_PX,
    `expected dragging the rail's sash ${RAIL_DRAG_PX}px to grow the rail by more than ${MIN_RAIL_GROWTH_PX}px (before=${before}, after=${after})`,
  );
}

// The FX rail's bottom panel (PANEL_SPECS' fx-positions), which stays in
// the grid when its rail partner floats out.
const RAIL_REMAINING_PANEL_ID = "fx-positions";

/**
 * Floats the rail's top panel — a member of the rail's design pin — and then
 * drags the sash its remaining partner now shares with the main column. A
 * float suspends the pin; this proves the suspension actually frees the
 * partner, and fails (before=360, after=360) if it does not release.
 *
 * Measured NOT to depend on the stale-branch fix that
 * {@link expectRailSashDragResizes} guards: with that fix removed this still
 * passes, because floating a member restructures the rail's grid node and so
 * rebuilds its cached limits anyway. It guards the float path's own release,
 * not the fresh-boot one. Dockview-engine only.
 */
export async function expectRailSashDragResizesAfterFloatingRailMember(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.layout.floatPanel(RAIL_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [RAIL_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const before = await ctx.po.layout.dockPanelWidth(RAIL_REMAINING_PANEL_ID);
  await ctx.po.layout.dragDockSashLeftOf(RAIL_REMAINING_PANEL_ID, RAIL_DRAG_PX);
  const after = await ctx.po.layout.dockPanelWidth(RAIL_REMAINING_PANEL_ID);

  assertTrue(
    after - before > MIN_RAIL_GROWTH_PX,
    `expected dragging the rail's sash ${RAIL_DRAG_PX}px after floating ${RAIL_PANEL_ID} to grow ${RAIL_REMAINING_PANEL_ID} by more than ${MIN_RAIL_GROWTH_PX}px (before=${before}, after=${after})`,
  );
}

/** Waits for the layout-engine root's `data-engine` witness to equal
 * `engine` — see {@link PrefsLayoutEngine}. */
export async function expectEngine(
  ctx: TestContext,
  engine: PrefsLayoutEngine,
): Promise<void> {
  await ctx.po.layout.waitEngine(engine, ENGINE_SWITCH_TIMEOUT_MS);
}

/** Waits for the dockview engine root's `data-groups` witness to equal
 * `count`, within `seconds`. */
export async function expectDockGroups(
  ctx: TestContext,
  count: number,
  seconds: number,
): Promise<void> {
  await ctx.po.layout.waitDockGroupCount(count, seconds * 1_000);
}

/**
 * Opens Preferences via the account menu, selects the Layout engine row's
 * In-house/Dockview option, then closes the modal — mirrors
 * equitiesChart.ts's `openPreferencesAndSelectSubstrate` exactly (the
 * preference takes effect immediately: `useLayoutEngine` persists +
 * pushes synchronously, remounting the engine on the next render), so no
 * extra settle wait is needed here; callers assert the resulting engine via
 * {@link expectEngine}.
 */
export async function openPreferencesAndSelectLayoutEngine(
  ctx: TestContext,
  value: PrefsLayoutEngine,
): Promise<void> {
  await ctx.po.preferences.open();
  await ctx.po.preferences.waitModalVisible(3_000);
  await ctx.po.preferences.selectLayoutEngine(value);
  await ctx.po.preferences.close();
  await ctx.po.preferences.waitModalHidden(3_000);
}

/**
 * Drags the "Blotter" dockview tab onto the Live Rates panel's own content
 * (its always-mounted CurrencyFilter row, since the panel body itself
 * carries no testid), docking the two panels into a single dockview group.
 * Dockview-engine only — callers must already be on `engine: "dockview"`.
 */
export async function dragBlotterTabOntoRates(ctx: TestContext): Promise<void> {
  await ctx.po.layout.dragDockTabOnto(
    BLOTTER_PANEL_ID,
    RATES_PANEL_DROP_TARGET,
  );
}

/**
 * Drags the stacked "Blotter" tab to the LEFT edge band of its own group's
 * body (the blotter table is the group's visible content — a freshly
 * stacked panel is the active tab, so the rates content underneath is
 * hidden and has no drop geometry): an EDGE drop splits the panel back out
 * into a NEW group there, growing the group count by one — the inverse of
 * {@link dragBlotterTabOntoRates}'s centre-merge. Dockview-engine only.
 */
export async function splitBlotterOutToTheLeft(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.layout.dragDockTabToEdge(
    BLOTTER_PANEL_ID,
    TESTIDS.blotter.table,
    "left",
  );
}

// PANEL_SPECS' fx-analytics panel id — the rail panel the strip-rejection
// scenario collapses (its strip bar and header collapse control share
// TESTIDS.layout.collapseControl).
const ANALYTICS_PANEL_ID = "fx-analytics";

/** Collapses the Analytics rail panel into a strip via its header "—". */
export async function collapseAnalyticsPanel(ctx: TestContext): Promise<void> {
  await ctx.po.layout.collapsePanel(ANALYTICS_PANEL_ID);
  await ctx.po.layout.waitDockCollapsed(
    [ANALYTICS_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );
}

/** Expands the collapsed Analytics panel via its strip restore bar. */
export async function expandAnalyticsPanel(ctx: TestContext): Promise<void> {
  await ctx.po.layout.expandPanel(ANALYTICS_PANEL_ID);
  await ctx.po.layout.waitDockCollapsed([], ENGINE_SWITCH_TIMEOUT_MS);
}

/**
 * Drops the "Blotter" tab onto the centre of the COLLAPSED Analytics
 * panel's strip bar and asserts the drop was REJECTED: a stripped group is
 * locked as a drop target (a swallow-proof bar — without the lock this
 * exact centre-drop merged into the hidden-header group and the panel
 * became unreachable), so the group count must still read `groupsBefore`.
 */
export async function dragBlotterOntoCollapsedAnalyticsIsRejected(
  ctx: TestContext,
  groupsBefore: number,
): Promise<void> {
  await ctx.po.layout.dragDockTabOnto(
    BLOTTER_PANEL_ID,
    TESTIDS.layout.collapseControl(ANALYTICS_PANEL_ID),
  );
  await expectDockGroups(ctx, groupsBefore, 5);
}

// Generous ceiling for the child window's load + the dock-home settle — a
// real window.open on a loaded CI runner, not a same-document poll.
const POPUP_TIMEOUT_MS = 5_000;

/**
 * Pops the blotter out into a real child window, proves the group's DOM
 * moved wholesale across the document boundary (the portalled head slot AND
 * the live panel body resolve in the CHILD document), then closes the
 * window from inside — `beforeunload` must run for dockview's native
 * dock-home — and asserts the panel is back (popped witness empty, group
 * count restored).
 */
export async function popoutBlotterShowsLiveContentAndDocksHomeOnClose(
  ctx: TestContext,
): Promise<void> {
  const popup = await ctx.po.layout.popoutPanel(BLOTTER_PANEL_ID);

  await popup.waitForTestId(
    TESTIDS.layout.dockTab(BLOTTER_PANEL_ID),
    POPUP_TIMEOUT_MS,
  );
  await popup.waitForTestId(TESTIDS.blotter.table, POPUP_TIMEOUT_MS);
  await ctx.po.layout.waitDockPopped([BLOTTER_PANEL_ID], POPUP_TIMEOUT_MS);

  await popup.closeFromInside();
  await ctx.po.layout.waitDockPopped([], POPUP_TIMEOUT_MS);
  await ctx.po.layout.waitDockGroupCount(4, POPUP_TIMEOUT_MS);
}

// fx-rates starts at 0.66 of the shared column's height; once fx-blotter
// (0.34) floats out, fx-rates alone should claim the WHOLE column (a ~1.52x
// grow). 1.2x is a generous floor well below that, safe against header
// chrome / gutter rounding while still failing hard if the sibling didn't
// reflow at all.
const MIN_SIBLING_GROWTH_FACTOR = 1.2;

/**
 * Floats the blotter panel and proves two things no jsdom witness can see,
 * because jsdom lays nothing out: first, that fx-rates — its column sibling
 * in FX_ROOT's left-hand split — actually grows to fill the vacated space
 * (the real-DOM proof the row was actually left, not merely that the
 * `data-floating` bookkeeping flipped); second, that the float survives a
 * reload and then docks back INTO fx-rates' column — fx-rates shrinks back by
 * the same factor it grew, which a panel still floating cannot produce. It
 * does not return to the seed height: dockview's move splits the anchor
 * group in half (see the measurement below). Dockview-engine only — callers
 * must already be on `engine: "dockview"`.
 */
export async function floatBlotterGrowsRatesSurvivesReloadAndDocksHome(
  ctx: TestContext,
): Promise<void> {
  const ratesHeightDocked = await ctx.po.layout.panelHeight(RATES_PANEL_ID);

  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const ratesHeightFloating = await ctx.po.layout.panelHeight(RATES_PANEL_ID);

  assertGte(
    ratesHeightFloating,
    ratesHeightDocked * MIN_SIBLING_GROWTH_FACTOR,
    `expected fx-rates to grow once fx-blotter floated out of their shared column (docked height=${ratesHeightDocked}, floating height=${ratesHeightFloating})`,
  );

  // A plain reload always lands back on the default tab (see the "switching
  // the layout engine" test above), so the FX tab must be re-selected
  // before re-asserting the floating witness.
  //
  // The restored float is judged on the dock's FIRST render, not by a
  // polled wait: `waitDockFloating` alone once passed here while the
  // restore published nothing. The engine's construction never announced
  // the float; what repaired `data-floating` a microtask later was
  // unrelated — construction re-clamping the FX rail's design pin, a
  // layout change the float publisher happens to ride. Measured
  // (2026-09-19): that clamp fires only because the BLOTTER floated here; a
  // floated rail member suspends the pin, nothing repairs the witness, and
  // the float's head offered Float/Collapse/Maximize instead of Dock.
  await ctx.po.layout.recordFirstDockRender(BLOTTER_PANEL_ID);
  await common.reloadPage(ctx);
  await common.clickTab(ctx, "fx");
  await expectEngine(ctx, "dockview");

  const restored = await ctx.po.layout.firstDockRender(
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  assertEquals(
    restored.floating.join(" "),
    BLOTTER_PANEL_ID,
    `expected the restored float in data-floating on the dock's first render, got "${restored.floating.join(" ")}"`,
  );
  assertEquals(
    restored.floatControlLabel,
    "Dock Blotter",
    `expected the restored float's head to offer Dock on its first render, got "${restored.floatControlLabel}"`,
  );
  assertFalse(
    restored.hasCollapseControl,
    "a restored float's head must not offer Collapse (R1)",
  );
  assertFalse(
    restored.hasMaximizeControl,
    "a restored float's head must not offer Maximize (R2)",
  );

  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  await ctx.po.layout.dockPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);
  await expectDockGroups(ctx, 4, 5);

  // The group count reads 4 whether fx-blotter is floating or docked (a
  // float is still a group), so it cannot witness the dock. fx-rates' height
  // can: it only shrinks back if fx-blotter re-entered ITS column. Measured
  // (2026-09-19, React client, this suite's viewport): docked 400 → floating
  // 613 → home 303. Home is NOT the seed's 400 — dockview's move splits the
  // anchor group in half rather than restoring the seed's 0.66/0.34 share —
  // so the assertion is "gave the space back", not "restored the seed
  // height".
  const ratesHeightHome = await ctx.po.layout.panelHeight(RATES_PANEL_ID);

  assertLte(
    ratesHeightHome,
    ratesHeightFloating / MIN_SIBLING_GROWTH_FACTOR,
    `expected fx-rates to shrink back once fx-blotter docked home into their shared column (floating height=${ratesHeightFloating}, home height=${ratesHeightHome})`,
  );
}
