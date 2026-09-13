import type { LayoutState, PanelId } from "#/layout";

export interface LayoutIntents {
  maximize(id: PanelId): void;
  restore(): void;
  collapse(id: PanelId): void;
  expand(id: PanelId): void;
  resize(path: readonly number[], sizes: readonly number[]): void;
  /** Dock a new leaf onto the tree (an ordinary panel by every other
   * measure — maximize/collapse/resize need no changes to reach it). See
   * `dockColumn.ts`'s `insertDockedLeaf` for the placement rules. A
   * duplicate `id` (already present anywhere in the tree) is a no-op. */
  insertPanel(panelId: PanelId): void;
  /** Undock a leaf. Once the dock column it lived in empties out, the tree
   * is restored exactly to what it was before any docking — see
   * `dockColumn.ts`'s `removeDockedLeaf`. Also clears `maximized` if it named
   * this panel, and drops it from `collapsed` — otherwise a removed-while-
   * maximized panel would leave every other panel stripped with nothing
   * maximized, and a removed-while-collapsed panel would silently come back
   * pre-collapsed on a later re-insert of the same id. An unknown `id` is a
   * no-op. */
  removePanel(panelId: PanelId): void;
  /** Hide a STATIC panel from the workspace (the View menu's uncheck). The
   * tree keeps its leaf — engines project visibility — so `reopen` restores
   * the seed position. Refused (no-op) for non-static ids (docked Jarvis
   * panels have dismiss/undock instead) and when it would hide the tab's
   * last visible static leaf. Also drops the id's `collapsed` entry and
   * clears `maximized` if it named this panel — a hidden panel must not
   * linger as a strip or keep every sibling stripped. */
  close(id: PanelId): void;
  /** Un-hide a closed panel (the View menu's re-check). Unknown or not-closed
   * ids no-op. */
  reopen(id: PanelId): void;
  /** Discard the tree, `maximized`, and `collapsed` back to `port.initial` —
   * the port this machine was created with. */
  reset(): void;
}

export interface LayoutMachineOptions {
  /** Starting value for the fold — a workspace layout restored from the
   * persisted payload (see `composition.ts`'s `layoutFor`). Deliberately
   * SEPARATE from `port.initial`, which keeps owning the tab's DEFAULT-tree
   * identity for the two things that must not follow the restored tree:
   * - `staticIds` below, derived from `port.initial.root`, is what tells a
   *   dock column apart from a real rail. Seeded through `port.initial`
   *   instead, a restored tree's docked leaves would count as STATIC ids, so
   *   the next `insertPanel` would not recognise the restored dock column
   *   and would append a SECOND one beside it.
   * - `reset()` returns `port.initial`, i.e. the default tree — the whole
   *   point of the intent. Seeded through `port.initial` it would hand back
   *   the saved layout it is supposed to discard.
   * Absent (the ordinary case) the fold starts at `port.initial`, so this
   * option changes nothing for a machine created without it. */
  readonly seedState?: LayoutState;
}
