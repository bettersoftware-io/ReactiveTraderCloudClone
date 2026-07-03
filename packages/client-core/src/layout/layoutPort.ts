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
