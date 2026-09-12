/** Per-tab persistence seam for the Dockview engine's serialized layout blob
 * (the JSON `DockviewApi.toJSON()`/`fromJSON()` shape — opaque to this
 * interface). Mirrors `SessionStore`'s shape: a plain load/save pair, no
 * streaming. `load` returns null when nothing is stored for that tab (or the
 * store itself has never seen a write); `createDockEngine` (Task 3) already
 * falls back to the seed tree on a null OR corrupt blob, so this seam never
 * needs to distinguish "empty" from "invalid". */
export interface DockLayoutStore {
  load(tab: string): string | null;
  save(tab: string, blob: string): void;
  /** Discard `tab`'s stored blob — `resetWorkspaceLayout`'s per-tab cleanup,
   * so a subsequent `load(tab)` reports null instead of handing back the
   * discarded layout on the next boot. */
  clear(tab: string): void;
}
