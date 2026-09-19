import type { PrefsLayoutEngine } from "../page-objects/contracts/Preferences";
import { TESTIDS } from "../page-objects/contracts/testids";
import type { TestContext } from "../testContext";
import {
  assertEquals,
  assertFalse,
  assertGreaterThanZero,
  assertGte,
  assertLte,
  assertNotEqual,
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

/**
 * Pops the blotter out and proves the window wears the app's THEME, live: its
 * own `<html>` carries the skin, the mode and the token values (the first
 * cut carried none — every `var(--…)` resolved to nothing, text went black
 * and the window ignored skin and light/dark, user report 2026-09-19), and a
 * light/dark switch in the MAIN window repaints the open pop-out. Needs a
 * real browser: jsdom cannot open a window at all.
 */
export async function popoutBlotterFollowsTheAppTheme(
  ctx: TestContext,
): Promise<void> {
  const popup = await ctx.po.layout.popoutPanel(BLOTTER_PANEL_ID);

  await popup.waitForTestId(TESTIDS.blotter.table, POPUP_TIMEOUT_MS);

  const opened = await popup.rootTheme();

  assertTrue(
    opened.skin !== null && opened.mode !== null,
    `expected the pop-out's <html> to carry data-skin and data-mode, got skin=${opened.skin} mode=${opened.mode}`,
  );
  assertTrue(
    opened.textPrimaryToken !== "",
    "expected the pop-out to carry the skin's token values (--text-primary was empty)",
  );

  const otherMode = opened.mode === "dark" ? "light" : "dark";

  await ctx.po.themeToggle.click();
  await popup.waitForRootMode(otherMode, POPUP_TIMEOUT_MS);

  const switched = await popup.rootTheme();

  assertNotEqual(
    switched.textPrimaryToken,
    opened.textPrimaryToken,
    `expected the pop-out's token values to follow the ${otherMode} switch`,
  );

  await popup.closeFromInside();
  await ctx.po.layout.waitDockPopped([], POPUP_TIMEOUT_MS);
}

/** The FX rail's 360px design width, which pins fx-analytics. */
const ANALYTICS_DESIGN_WIDTH_PX = 360;
/** Card-edge rounding the rail's docked width may show. */
const RAIL_WIDTH_SLACK_PX = 2;

/**
 * Floats the pinned FX rail panel, pops it OUT of its float, closes the
 * window, and proves the round trip ends where it began: the panel returns to
 * its float (dockview's pop-out docks home to the group it came from), and
 * docking it from there re-clamps the rail at its design width. Needs a real
 * browser — jsdom only reaches a blocked pop-out. Its first run caught a
 * regression before merge: the pop-out theme mirror read the closing
 * window's document inside dockview's remove event, the throw aborted the
 * dock-home, and the panel vanished from the app.
 */
export async function floatedRailPanelPopsOutAndComesBack(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.layout.floatPanel(ANALYTICS_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [ANALYTICS_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const popup = await ctx.po.layout.popoutPanel(ANALYTICS_PANEL_ID);

  await ctx.po.layout.waitDockPopped([ANALYTICS_PANEL_ID], POPUP_TIMEOUT_MS);

  await popup.closeFromInside();
  await ctx.po.layout.waitDockPopped([], POPUP_TIMEOUT_MS);
  await ctx.po.layout.waitDockFloating(
    [ANALYTICS_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );
  assertTrue(
    await ctx.po.layout.panelSitsInFloat(ANALYTICS_PANEL_ID),
    "expected the panel back in its float after the pop-out closed",
  );

  await ctx.po.layout.dockPanel(ANALYTICS_PANEL_ID);
  await ctx.po.layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);

  const docked = await ctx.po.layout.dockPanelWidth(ANALYTICS_PANEL_ID);

  assertLte(
    Math.abs(docked - ANALYTICS_DESIGN_WIDTH_PX),
    RAIL_WIDTH_SLACK_PX,
    `expected the rail back at its ${ANALYTICS_DESIGN_WIDTH_PX}px design width once docked, got ${docked}px`,
  );
}

/** How far each float resize drags its handle, and how close the float's
 * box must follow: one 10-step drag's first step plus rounding. */
const FLOAT_RESIZE_PX = 120;
const FLOAT_RESIZE_SLACK_PX = 20;

/**
 * Floats the blotter and resizes it from an EDGE and from a CORNER, proving
 * dockview's resize handles are reachable. They were not: dockview's own
 * stylesheet resolves their z-index to `auto` (a self-referencing custom
 * property), leaving them under the float's content, and the float's
 * `overflow: hidden` clipped the corners away (user report, 2026-09-19).
 * Dockview-engine only.
 */
export async function floatBlotterResizesFromAnEdgeAndACorner(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const opened = await ctx.po.layout.floatBox(BLOTTER_PANEL_ID);

  await ctx.po.layout.resizeFloatFrom(
    BLOTTER_PANEL_ID,
    "right",
    FLOAT_RESIZE_PX,
    0,
  );

  const widened = await ctx.po.layout.floatBox(BLOTTER_PANEL_ID);

  assertLte(
    Math.abs(widened.width - opened.width - FLOAT_RESIZE_PX),
    FLOAT_RESIZE_SLACK_PX,
    `expected the right edge to widen the float by ~${FLOAT_RESIZE_PX}px (${opened.width} → ${widened.width})`,
  );

  await ctx.po.layout.resizeFloatFrom(
    BLOTTER_PANEL_ID,
    "bottomright",
    -FLOAT_RESIZE_PX,
    FLOAT_RESIZE_PX,
  );

  const cornered = await ctx.po.layout.floatBox(BLOTTER_PANEL_ID);

  assertLte(
    Math.abs(widened.width - cornered.width - FLOAT_RESIZE_PX),
    FLOAT_RESIZE_SLACK_PX,
    `expected the corner to narrow the float by ~${FLOAT_RESIZE_PX}px (${widened.width} → ${cornered.width})`,
  );
  assertLte(
    Math.abs(cornered.height - widened.height - FLOAT_RESIZE_PX),
    FLOAT_RESIZE_SLACK_PX,
    `expected the corner to heighten the float by ~${FLOAT_RESIZE_PX}px (${widened.height} → ${cornered.height})`,
  );

  await ctx.po.layout.dockPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);
}

// fx-rates starts at 0.66 of the shared column's height; once fx-blotter
// (0.34) floats out, fx-rates alone should claim the WHOLE column (a ~1.52x
// grow). 1.2x is a generous floor well below that, safe against header
// chrome / gutter rounding while still failing hard if the sibling didn't
// reflow at all.
const MIN_SIBLING_GROWTH_FACTOR = 1.2;

// A dock-home re-applies the extent the panel had before it floated (the
// engine remembers it as the float opens). Measured, not assumed, as the
// panel's own group height before and after; 2px absorbs the browser's
// sub-pixel rounding of a split's integer model sizes, far below the ~100px
// a bare dockview move would leave it off (it halves the anchor group).
const HOME_HEIGHT_TOLERANCE_PX = 2;

/**
 * Floats the blotter and docks it straight home, proving the one thing no
 * jsdom witness can see, because jsdom lays nothing out: the panel comes back
 * at its OWN pre-float height, not merely into its old slot. Dockview-engine
 * only — callers must already be on `engine: "dockview"`.
 */
export async function floatBlotterAndDockHomeRestoresItsHeight(
  ctx: TestContext,
): Promise<void> {
  const ratesHeightDocked = await ctx.po.layout.panelHeight(RATES_PANEL_ID);
  const blotterHeightDocked = await ctx.po.layout.panelHeight(BLOTTER_PANEL_ID);

  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );
  await expectBlotterInFloat(ctx, true);

  await ctx.po.layout.dockPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);
  await expectDockGroups(ctx, 4, 5);

  await expectBlotterDockedHome(ctx, blotterHeightDocked, ratesHeightDocked);
}

/**
 * Floats the blotter panel and proves three things no jsdom witness can see,
 * because jsdom lays nothing out: first, that fx-rates — its column sibling
 * in FX_ROOT's left-hand split — actually grows to fill the vacated space
 * (the real-DOM proof the row was actually left, not merely that the
 * `data-floating` bookkeeping flipped); second, that the float survives a
 * reload; third, that docking it home AFTER that reload still restores the
 * blotter's own pre-float height — the remembered size rode the reload in
 * the blob, since the reloaded grid alone no longer holds it. Dockview-engine
 * only — callers must already be on `engine: "dockview"`.
 */
export async function floatBlotterGrowsRatesSurvivesReloadAndDocksHome(
  ctx: TestContext,
): Promise<void> {
  const ratesHeightDocked = await ctx.po.layout.panelHeight(RATES_PANEL_ID);
  const blotterHeightDocked = await ctx.po.layout.panelHeight(BLOTTER_PANEL_ID);

  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const ratesHeightFloating = await ctx.po.layout.panelHeight(RATES_PANEL_ID);

  await expectBlotterInFloat(ctx, true);
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

  await expectBlotterDockedHome(ctx, blotterHeightDocked, ratesHeightDocked);
}

/** How far a float is dragged by its head, per axis — well clear of the
 * few px dockview's overlay loses to taking its grip offset from the first
 * pointermove, and small enough that the move stays inside the dock (the
 * float is clamped to it) from where a popped-out blotter opens. */
const FLOAT_DRAG_DX = -200;
const FLOAT_DRAG_DY = -150;
/** How close the float must land to the drag: one 15-step drag's first
 * step (~13px) plus rounding. */
const FLOAT_DRAG_SLACK_PX = 20;

/**
 * Floats the blotter and proves it behaves like a window: it POPS OUT (opens
 * narrower than the full-width slot it left, so it visibly lifts off the
 * grid), and a drag on its HEAD — where a user grips a dialog — carries it
 * with the pointer, the panel still floating afterwards. The first cut of
 * floats did neither: the float detached in place at full size and only a
 * blank 22px rail above the head moved it (user report, 2026-09-19).
 * Dockview-engine only.
 */
export async function floatBlotterPopsOutAndMovesByItsHead(
  ctx: TestContext,
): Promise<void> {
  const dockedWidth = await ctx.po.layout.dockPanelWidth(BLOTTER_PANEL_ID);

  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating(
    [BLOTTER_PANEL_ID],
    ENGINE_SWITCH_TIMEOUT_MS,
  );

  const opened = await ctx.po.layout.floatBox(BLOTTER_PANEL_ID);

  assertLte(
    opened.width,
    dockedWidth - 1,
    `expected the float to pop out narrower than its docked slot (docked width=${dockedWidth}, float width=${opened.width})`,
  );

  await ctx.po.layout.dragFloatByHead(
    BLOTTER_PANEL_ID,
    FLOAT_DRAG_DX,
    FLOAT_DRAG_DY,
  );

  const moved = await ctx.po.layout.floatBox(BLOTTER_PANEL_ID);
  const dx = moved.x - opened.x;
  const dy = moved.y - opened.y;

  assertLte(
    Math.abs(dx - FLOAT_DRAG_DX),
    FLOAT_DRAG_SLACK_PX,
    `expected a head drag of ${FLOAT_DRAG_DX}px to move the float horizontally with it, moved ${dx}px`,
  );
  assertLte(
    Math.abs(dy - FLOAT_DRAG_DY),
    FLOAT_DRAG_SLACK_PX,
    `expected a head drag of ${FLOAT_DRAG_DY}px to move the float vertically with it, moved ${dy}px`,
  );
  await expectBlotterInFloat(ctx, true);

  await ctx.po.layout.dockPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);
}

/** Asserts `panelSitsInFloat` for fx-blotter reads `expected` — the DOM
 * witness of where the group actually lives. Asserted `true` while floating
 * too, so a `false` after dock-home cannot come from a selector that never
 * matches a float at all. */
async function expectBlotterInFloat(
  ctx: TestContext,
  expected: boolean,
): Promise<void> {
  const inFloat = await ctx.po.layout.panelSitsInFloat(BLOTTER_PANEL_ID);

  assertEquals(
    inFloat,
    expected,
    `expected fx-blotter ${expected ? "inside" : "outside"} dockview's float container`,
  );
}

/**
 * Asserts fx-blotter really docked home at its pre-float size. Its own
 * height ALONE cannot say so: a float opens at its group's pre-float size
 * (`floatingBoundsFor`), so a blotter that never docked measures the same.
 * And `waitDockFloating([])` reads the engine's `data-floating` bookkeeping,
 * which has read empty once before over a float the engine never published.
 * Two witnesses that differ between floating and docked carry it: the
 * group is no longer inside dockview's float container, and fx-rates — its
 * column sibling, which grew while it floated — is back at its own
 * pre-float height, i.e. gave the space back. Both within
 * {@link HOME_HEIGHT_TOLERANCE_PX}.
 */
async function expectBlotterDockedHome(
  ctx: TestContext,
  blotterHeightDocked: number,
  ratesHeightDocked: number,
): Promise<void> {
  await expectBlotterInFloat(ctx, false);

  const blotterHeightHome = await ctx.po.layout.panelHeight(BLOTTER_PANEL_ID);
  const ratesHeightHome = await ctx.po.layout.panelHeight(RATES_PANEL_ID);

  assertLte(
    Math.abs(blotterHeightHome - blotterHeightDocked),
    HOME_HEIGHT_TOLERANCE_PX,
    `expected fx-blotter to dock home at its pre-float height (docked height=${blotterHeightDocked}, home height=${blotterHeightHome})`,
  );
  assertLte(
    Math.abs(ratesHeightHome - ratesHeightDocked),
    HOME_HEIGHT_TOLERANCE_PX,
    `expected fx-rates to give the space back once fx-blotter docked home (docked height=${ratesHeightDocked}, home height=${ratesHeightHome})`,
  );
}
