/** The replaceable layout seam. Lives in the APP layer (NOT @rtc/domain):
 * layout is presentation infrastructure — a tree of split directions and pixel
 * fractions — not business domain, and @rtc/domain is rxjs-only/business-pure
 * (dependency-cruiser `domain-stays-pure`). A future `DockviewLayoutEngine`
 * satisfies the same `LayoutPort` consumption contract; the app depends only on
 * this interface. Types are pinned verbatim by the HUD-redesign interfaces doc §5. */
export type PanelId = string;
export interface PanelSpec {
  readonly id: PanelId;
  readonly title: string;
  readonly pinned?: boolean;
  /** False hides the panel's own maximize control (default true — like
   * `pinned`, an optional additive flag on the §5 contract). Not-maximizable
   * is NOT never-stripped: the panel still collapses to a strip when a
   * sibling maximizes (standalone semantics — e.g. the Credit New RFQ form,
   * which never fills the dock itself but yields to the RFQs board). */
  readonly maximizable?: boolean;
  /** How far this panel's maximize reaches (default "root", the whole dock).
   * "nearest-column" bounds it at the nearest ancestor column split — the
   * standalone design's rail panels maximize WITHIN their column: only the
   * column siblings collapse to strip bars while everything outside (the
   * main column, the main/rail split ratio, the rail's design width) stays
   * untouched. Render-time policy only — LayoutState.maximized stays a bare
   * PanelId and the machine is unchanged; see maximizeBoundaryPath. */
  readonly maximizeScope?: "root" | "nearest-column";
}
export type SplitDir = "row" | "column";
export type LayoutNode =
  | {
      readonly kind: "split";
      readonly dir: SplitDir;
      readonly children: readonly LayoutNode[];
      readonly sizes: readonly number[];
      /** Per-child fixed size in css px along `dir`. A set entry overrides the
       * fractional size, renders flex:0 0 Npx, and suppresses adjacent resize
       * handles (like pinned). Additive to the §5 pinned contract. */
      readonly fixedPx?: readonly (number | undefined)[];
      /** Per-child INITIAL fixed size in css px along `dir` (the prototype's
       * design-value rail widths). Renders like `fixedPx` but KEEPS the
       * resize handles: the first drag converts the split to plain fractions
       * (the resize reducer clears this field), after which it behaves like
       * any ratio split. Ignored for a child that also has a `fixedPx`
       * entry. Additive to the §5 contract, like `fixedPx`. */
      readonly initialPx?: readonly (number | undefined)[];
    }
  | { readonly kind: "panel"; readonly panelId: PanelId };
export interface LayoutState {
  readonly root: LayoutNode;
  readonly maximized: PanelId | null;
  readonly collapsed: readonly PanelId[];
}
export interface LayoutPort {
  readonly initial: LayoutState;
}
