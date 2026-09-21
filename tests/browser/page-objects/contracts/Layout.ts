import type { PrefsLayoutEngine } from "./Preferences";

/**
 * Drives the in-house layout engine's resizable split panes. The reducer-level
 * resize maths is unit-tested; this PO exists to drive the *DOM-geometry*
 * pointer-drag of a splitter handle end-to-end (the one spot the engine is
 * framework-coupled), which no unit/contract test exercises.
 *
 * Also drives the switchable Dockview engine's own DOM-geometry surface —
 * the engine-root witness attributes (`data-engine`/`data-groups`) and its
 * one framework-coupled path no unit/contract test exercises: a real
 * pointer-drag docking two dockview tabs into one group.
 */
export interface LayoutPO {
  /** How many draggable splitter handles are currently rendered. */
  resizeHandleCount(): Promise<number>;
  /** The first splitter handle's size fraction (its `aria-valuenow`, 0..1). */
  firstResizeHandleSize(): Promise<number>;
  /** Pointer-drag the first splitter handle along its axis by `dx` CSS pixels. */
  dragFirstHandleBy(dx: number): Promise<void>;
  /** Wait for the layout-engine root's `data-maximized` witness (the
   *  maximized panel id, or "" when none — mirrored identically by
   *  InhouseLayoutEngine and DockviewLayoutEngine, Task 10) to equal
   *  `panelId` — the layout-state witness for a driven
   *  `{kind:"layout",op:"maximize",...}` command actually landing, under
   *  either engine. */
  waitPanelMaximized(panelId: string, timeoutMs: number): Promise<void>;
  /** Waits for the layout-engine root's `data-engine` witness to equal
   * `engine` — a preference switch remounts InhouseLayoutEngine/
   * DockviewLayoutEngine (App.tsx's `engine === "dockview"` ternary), so
   * this is a poll, not an instant read. */
  waitEngine(engine: PrefsLayoutEngine, timeoutMs: number): Promise<void>;
  /** Waits for the dockview engine root's `data-groups` witness to equal
   * `count` — the group-count outcome of a dock/undock, polled because
   * dockview's `onLayoutChange` (and this component's `groups` state
   * update) land asynchronously after the drag gesture completes. */
  waitDockGroupCount(count: number, timeoutMs: number): Promise<void>;
  /** Drags the dockview tab of panel `panelId` (the in-house header the
   * bridge portals into dockview's draggable `.dv-tab`, testid
   * `TESTIDS.layout.dockTab`) onto the centre of the panel whose content
   * carries `targetTestId`, docking them into one group. Dockview-engine
   * only — no `.dv-tab` element exists under the in-house engine. */
  dragDockTabOnto(panelId: string, targetTestId: string): Promise<void>;
  /** Drags panel `panelId`'s dockview tab to the `edge` band of the group
   * body holding `targetTestId`, splitting a NEW group off at that edge
   * (dockview reads the drop point against the whole group body: an edge
   * band is a split, only the centre is a merge — see dragDockTabOnto).
   * Dockview-engine only. */
  dragDockTabToEdge(
    panelId: string,
    targetTestId: string,
    edge: "left" | "right" | "top" | "bottom",
  ): Promise<void>;
  /** The rendered width, in CSS px, of the dockview group holding panel
   * `panelId`. Dockview-engine only. */
  dockPanelWidth(panelId: string): Promise<number>;
  /** Pointer-drags the dockview sash on panel `panelId`'s LEFT edge by `dx`
   * CSS px — for a rail panel, the root-row sash between the main column and
   * the rail. Grabs it a quarter of the way down the group, clear of the
   * corner where the rail's own horizontal sash starts. Dockview-engine only. */
  dragDockSashLeftOf(panelId: string, dx: number): Promise<void>;
  /** Clicks the panel's header "—" control, collapsing it into a strip
   * (`TESTIDS.layout.collapseControl` — the header-button state of the
   * shared id). */
  collapsePanel(panelId: string): Promise<void>;
  /** Clicks the collapsed panel's strip restore bar (the same shared
   * control id in its strip state), expanding it back to a full panel. */
  expandPanel(panelId: string): Promise<void>;
  /** Waits for the dockview engine root's `data-collapsed` witness (the
   * bridge's collapsed panel ids, space-joined) to equal `panelIds` —
   * polled, like the other engine-root witnesses. */
  waitDockCollapsed(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void>;
  /** Clicks the panel's ↗ pop-out control and resolves once the child
   * window exists and finished loading. Dockview-engine only — the control
   * is the bridge's optional slot. */
  popoutPanel(panelId: string): Promise<PopoutWindowPO>;
  /** Waits for the dockview engine root's `data-popped` witness (the
   * bridge's popped panel ids, space-joined, fed by the engine's
   * onPopoutsChange) to equal `panelIds`. */
  waitDockPopped(panelIds: readonly string[], timeoutMs: number): Promise<void>;
  /** Clicks `panelId`'s float control (`TESTIDS.layout.floatControl`) —
   * the head's single toggle button, `Float ${title}` while docked. Floats
   * its group as a box over the grid, and waits out the engine's debounced
   * layout-persistence write before returning (unlike a pop-out, a float
   * persists deliberately — see the Playwright driver's doc), so a caller
   * that reloads right after never races it. Dockview-engine only. */
  floatPanel(panelId: string): Promise<void>;
  /** Clicks `panelId`'s float control to dock it back home — the SAME
   * button as `floatPanel`, now reading `Dock ${title}`. Asserts the panel
   * is actually floating first (reading the live `data-floating` witness,
   * not merely waiting on it): the button always exists and always
   * responds to a click, so a click alone cannot distinguish "docked it"
   * from "floated a panel that was already docked" — a mis-click here
   * would otherwise read as a clean dock. Mirrors the shared ui-contract
   * tier's `DockviewEnginePage.dockPanel`, the house rule for this guard. */
  dockPanel(panelId: string): Promise<void>;
  /** Waits for the dockview engine root's `data-floating` witness (the
   * bridge's floating panel ids, space-joined, fed by the engine's
   * onFloatsChange) to equal `panelIds` — `onFloatsChange` is
   * microtask-deferred, so a synchronous read right after a float/dock
   * click is not reliable; this is `waitDockPopped`'s twin for the
   * float/dock channel. */
  waitDockFloating(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void>;
  /** Arms a one-shot recorder for the NEXT document load (call it before a
   * reload): the first render in which `panelId`'s head controls exist under
   * the dockview engine is snapshotted by a MutationObserver, in the same
   * microtask as that render — before any later layout change can publish a
   * floating set the construction itself failed to. Read it back with
   * `firstDockRender`. */
  recordFirstDockRender(panelId: string): Promise<void>;
  /** The snapshot `recordFirstDockRender` armed, waiting for it to exist. */
  firstDockRender(timeoutMs: number): Promise<FirstDockRender>;
  /** The on-screen height (px) of `panelId`'s dockview group — read off the
   * `.dv-groupview` ancestor of its `.dv-tab` mount (the same element
   * `dragDockTabOnto`/`dragDockTabToEdge` key off), re-sampled until laid
   * out. Dockview-engine only. Exists so a scenario can prove a sibling
   * panel actually grows once another panel floats out of their shared
   * column — a real-DOM geometry claim no jsdom witness can make. */
  panelHeight(panelId: string): Promise<number>;
  /** The on-screen width (px) of `panelId`'s dockview group — `panelHeight`'s
   * twin, on the axis a rail's sash divides. Exists so a scenario can prove a
   * width the USER chose survives a reload, which no jsdom witness can claim.
   * Dockview-engine only. */
  panelWidth(panelId: string): Promise<number>;
  /** The panel titles sharing `panelId`'s dockview group, in tab order — the
   * witness for WHERE a docked panel sits. A group COUNT cannot say it: a
   * panel stacked into a neighbour's group and a panel re-added as its own
   * column can leave the same count behind. Dockview-engine only. */
  dockGroupMates(panelId: string): Promise<readonly string[]>;
  /** Whether `panelId`'s dockview group currently sits inside dockview's
   * FLOAT container (a `.dv-resize-container`, the box dockview mounts every
   * floating group in) — read off the DOM, independent of the engine's own
   * `data-floating` bookkeeping. Exists because a height alone cannot tell
   * "docked home at that size" from "never docked". Dockview-engine only. */
  panelSitsInFloat(panelId: string): Promise<boolean>;
  /** The on-screen box of the float holding `panelId` — its
   * `.dv-resize-container`. Throws when the panel is not floating.
   * Dockview-engine only. */
  floatBox(panelId: string): Promise<FloatBox>;
  /** Drags the float holding `panelId` by `dx`/`dy` px, gripping its HEAD at
   * a point that is not one of the head's own controls — where a user takes
   * hold of a dialog. Dockview-engine only. */
  dragFloatByHead(panelId: string, dx: number, dy: number): Promise<void>;
  /** Resizes the float holding `panelId` by dragging one of dockview's
   * resize handles — an edge or a corner — by `dx`/`dy` px, gripping the
   * handle at its centre. Dockview-engine only. */
  resizeFloatFrom(
    panelId: string,
    handle: FloatResizeHandle,
    dx: number,
    dy: number,
  ): Promise<void>;
  /** Drags the float holding `panelId` by its head onto `targetPanelId`'s
   * group, pressing Shift partway — the drag-to-dock gesture — and releases
   * near that group's `side` edge. Dockview-engine only. */
  shiftDragFloatOnto(
    panelId: string,
    targetPanelId: string,
    side: FloatDockSide,
  ): Promise<void>;
  /** Opens the app-head View dropdown (`view-menu-toggle`) — the same
   * control whichever engine is active, revealing the per-panel visibility
   * rows and, under Dockview, the LAYOUTS section (Phase 6b saved
   * layouts). */
  openViewMenu(): Promise<void>;
  /** Closes the View dropdown — the SAME toggle button `openViewMenu`
   * clicks, since it is a plain open/closed flip. */
  closeViewMenu(): Promise<void>;
  /** Clicks `panelId`'s View-menu checkbox row (`view-menu-row-<id>`),
   * closing a visible static panel or reopening a closed one. Requires the
   * View menu already open (`openViewMenu`). */
  toggleViewMenuRow(panelId: string): Promise<void>;
  /** Waits for the dockview engine root's `data-closed` witness (the
   * LayoutMachine's layer-2 closed set, from a View-menu row toggle OR a
   * loaded/reset layout) to equal `panelIds` — `waitDockCollapsed`'s twin
   * for the closed channel. Dockview-engine only (the in-house engine
   * renders no such witness). */
  waitDockClosed(panelIds: readonly string[], timeoutMs: number): Promise<void>;
  /** Opens the LAYOUTS section's "Save current as…" name field, types
   * `name`, and confirms — leaves the View menu OPEN afterward (the
   * component never closes it on a save). Requires the View menu already
   * open. Assumes the save succeeds outright (no same-named preset to
   * replace) — a scenario driving the replace-confirm path drives the
   * lower-level testids directly. */
  saveLayoutPreset(name: string): Promise<void>;
  /** Clicks the saved-layout row whose visible name is `name` — found by
   * its accessible name, never a guessed id: the controller MINTS every
   * preset's id, so no caller can know it up front. Loading closes the View
   * menu (the component's own `onDone`). Requires the View menu already
   * open. */
  loadLayoutPreset(name: string): Promise<void>;
  /** Clicks the built-in `Default` row — resets the active tab's layout
   * (a real dock rebuild under Dockview) and closes the View menu. Requires
   * the View menu already open. */
  loadDefaultLayout(): Promise<void>;
  /** Deletes the saved-layout row whose visible name is `name`: its bin,
   * then that SAME row's confirm — both found by accessible name, never a
   * guessed id (see `loadLayoutPreset`). Leaves the View menu OPEN
   * afterward (the component never closes it on a delete). Requires the
   * View menu already open. */
  deleteLayoutPreset(name: string): Promise<void>;
  /** Resolves once the saved-layout rows read exactly `names`, in DOM order
   * — `Default` and the "Save current as…" opener excluded, since neither
   * is a stored preset. RETRYING, like every other witness in this
   * contract: both a save and a delete land through a published stream, so
   * a single snapshot taken the instant after one of them races it.
   *
   * It also requires the LAYOUTS section's two ALWAYS-rendered rows to be
   * present, so an empty `names` cannot be satisfied by a View menu that
   * closed (or never opened) — an absent section reads as a distinct,
   * named state rather than as a clean empty list.
   *
   * Requires the View menu already open. */
  waitLayoutPresetNames(
    names: readonly string[],
    timeoutMs: number,
  ): Promise<void>;
  /** Resolves once `testId` is attached to the MAIN document — a positive
   * engine-side witness that an element genuinely rendered (e.g. a reopened
   * panel's own `TESTIDS.layout.dockTab` mount), mirroring
   * `PopoutWindowPO.waitForTestId`'s identical idiom for the child window. */
  waitForTestId(testId: string, timeoutMs: number): Promise<void>;
}

/** The side of a target group a drag-to-dock releases near. */
export type FloatDockSide = "left" | "right";

/** The float resize handles a scenario drives: an edge and a corner. */
export type FloatResizeHandle = "right" | "bottomright";

/** A document root's theme, as the ThemeProvider writes it: the skin and
 * mode attributes, and one token value (`--text-primary`) standing for the
 * inline token set — empty when no tokens reached the document at all. */
export interface RootTheme {
  readonly skin: string | null;
  readonly mode: string | null;
  readonly textPrimaryToken: string;
}

/** A float's on-screen box, in viewport px. */
export interface FloatBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the dock showed for one panel on the first render after a load —
 * `recordFirstDockRender`'s snapshot. */
export interface FirstDockRender {
  /** The engine root's `data-floating`, split. */
  readonly floating: readonly string[];
  /** The float/dock toggle's accessible name (`Float …` / `Dock …`). */
  readonly floatControlLabel: string | null;
  readonly hasCollapseControl: boolean;
  readonly hasMaximizeControl: boolean;
}

/** A live pop-out child window, as far as a scenario needs to drive it. */
export interface PopoutWindowPO {
  /** Resolves once `testId` is attached in the CHILD window's document —
   * the witness that the group's DOM (portalled head slot and live panel
   * body alike) moved wholesale across the document boundary. */
  waitForTestId(testId: string, timeoutMs: number): Promise<void>;
  /** Closes the window FROM INSIDE (`window.close()`), so `beforeunload`
   * runs and dockview docks the panels home — the driver's own page-close
   * skips `beforeunload` and must not be used for this path. */
  closeFromInside(): Promise<void>;
  /** The CHILD window's own root theme — what its `<html>` carries, read
   * inside that window. */
  rootTheme(): Promise<RootTheme>;
  /** Resolves once the CHILD window's `<html>` carries `data-mode` = `mode`;
   * rejects after `timeoutMs`. */
  waitForRootMode(mode: string, timeoutMs: number): Promise<void>;
  /** Whether the window has closed — a POSITIVE witness (true = closed),
   * read at the instant of the call. True for a window closed FROM INSIDE
   * (`closeFromInside`) and equally for one an engine rebuild's own
   * `dispose()` closed out from under it (dockview's own popout manager
   * calls `window.close()` on dispose) — the one live-browser path this
   * suite otherwise has no witness for, since jsdom blocks `window.open`
   * outright. */
  isClosed(): Promise<boolean>;
  /** Waits for the window to close, within `timeoutMs` — a no-op if it has
   * already closed by the time this is called (an already-fired `close`
   * event would otherwise never be seen by a fresh listener). */
  waitClosed(timeoutMs: number): Promise<void>;
}
