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
  /** Wait for the given layout panel (InhouseLayoutEngine's PanelLeaf) to
   *  report `data-maximized="true"` — the layout-state witness for a
   *  driven `{kind:"layout",op:"maximize",...}` command actually landing. */
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
}
