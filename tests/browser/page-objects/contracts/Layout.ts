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
}
