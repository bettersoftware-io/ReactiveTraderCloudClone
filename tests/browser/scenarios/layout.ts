import type { PrefsLayoutEngine } from "../page-objects/contracts/Preferences";
import { TESTIDS } from "../page-objects/contracts/testids";
import type { TestContext } from "../testContext";
import { assertGreaterThanZero, assertTrue } from "./assert";

// Drag the first splitter boundary a healthy distance along its axis; large
// enough that the resulting size-fraction change clears the assertion margin
// regardless of the exact container width.
const DRAG_PX = -140;
const MIN_FRACTION_DELTA = 0.02;

// A preference switch remounts InhouseLayoutEngine/DockviewLayoutEngine
// (App.tsx's `engine === "dockview"` ternary) — near-instant, but still a
// poll rather than an instant read.
const ENGINE_SWITCH_TIMEOUT_MS = 3_000;

// PANEL_SPECS' fx-blotter panel title
// (packages/client-core/src/layout/defaultLayoutPort.ts) — the dockview
// tab's own visible label (dockview-core's Tab renders our TitleOnlyTab,
// which sets its content to exactly this string).
const BLOTTER_TAB_TITLE = "Blotter";

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
    BLOTTER_TAB_TITLE,
    RATES_PANEL_DROP_TARGET,
  );
}
