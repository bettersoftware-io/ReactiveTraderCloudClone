import type { WorkspaceTab } from "#/layout";
import type { Stream } from "#/stream";

/** One row of the View menu's LAYOUTS section. `readable: false` is a record
 * the codec could not read (unknown version, bad shape, or — with
 * `id === UNREADABLE_LIST_ID` — the whole stored list): shown greyed, delete
 * only. `savedAt` is null exactly when unreadable. */
export interface LayoutPresetSummary {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string | null;
  readonly readable: boolean;
}

export type LayoutPresetNameProblem = "empty" | "too-long" | "reserved";

export type SaveLayoutPresetResult =
  | { readonly status: "saved"; readonly id: string }
  /** A preset with this name (case-insensitive) exists; call again with
   * `{ replace: true }` after the in-menu confirm. */
  | { readonly status: "exists"; readonly id: string }
  | { readonly status: "invalid"; readonly problem: LayoutPresetNameProblem }
  | { readonly status: "full" }
  /** No live Dockview engine registered a snapshot source for the tab. */
  | { readonly status: "unavailable" }
  /** The stored list is unreadable as a whole — delete that row first (P6). */
  | { readonly status: "store-unreadable" }
  /** The store ACCEPTED the write and kept nothing: storage is blocked or full
   * (private-mode Safari, disabled site data, quota exhausted). The port is a
   * dumb raw-string store by ruling P1 — `save` returns nothing and both
   * localStorage adapters swallow a throwing `setItem` by design — so the
   * controller detects this by re-reading the store after the write, never by
   * asking the adapter. */
  | { readonly status: "storage-failed" };

/** Options for `LayoutPresetsPresenter.save` — see its own doc. */
export interface SaveLayoutPresetOptions {
  readonly replace?: boolean;
}

export interface LayoutPresetsPresenter {
  presetsFor(tab: WorkspaceTab): Stream<readonly LayoutPresetSummary[]>;
  save(
    tab: WorkspaceTab,
    name: string,
    options?: SaveLayoutPresetOptions,
  ): SaveLayoutPresetResult;
  /** false when the id is unknown or unreadable. */
  load(tab: WorkspaceTab, id: string): boolean;
  remove(tab: WorkspaceTab, id: string): void;
  /** The built-in Default: this tab back to the shipped layout, both engines. */
  resetTab(tab: WorkspaceTab): void;
  /** The Dockview bridge registers its engine's `snapshotLayout` here on
   * construction and `null` on dispose. */
  registerSnapshotSource(
    tab: WorkspaceTab,
    source: (() => string) | null,
  ): void;
}
