import type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelSpec,
} from "./layoutPort";

export type WorkspaceTab = "fx" | "credit" | "admin" | "equities";

/** Static panel descriptors. `pinned: true` (unused by any default tree today)
 * marks a panel the engine renders in a fixed bottom strip, kept out of any
 * resizable split's sizes so a drag never touches it — the machinery stays
 * for a future panel that genuinely needs to opt out of resizing. Every
 * current default tree is fully user-resizable instead (Task 2). Ids are
 * stable — the PanelRegistry (Task 5) maps them to module roots. */
export const PANEL_SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  "fx-rates": { id: "fx-rates", title: "Live Rates" },
  "fx-analytics": { id: "fx-analytics", title: "Analytics" },
  "fx-positions": { id: "fx-positions", title: "Positions" },
  "fx-blotter": { id: "fx-blotter", title: "Blotter" },
  "credit-new-rfq": { id: "credit-new-rfq", title: "New RFQ" },
  "credit-rfqs": { id: "credit-rfqs", title: "RFQs" },
  "credit-blotter": { id: "credit-blotter", title: "Credit Blotter" },
  // Registered like every other spec, but not part of CREDIT_ROOT — it has no
  // dock slot yet (Task 4 flips the tabbed workspace to the three-panel dock;
  // sell-side isn't one of the three).
  "credit-sell-side": { id: "credit-sell-side", title: "Sell Side" },
  "admin-dashboard": { id: "admin-dashboard", title: "Admin" },
  equities: { id: "equities", title: "Equities" },
};

const FX_ROOT: LayoutNode = {
  kind: "split",
  dir: "column",
  sizes: [0.78, 0.22],
  children: [
    {
      kind: "split",
      dir: "row",
      // 0.26 ≈ 360px at the prototype's 1400px reference viewport — a ratio
      // default that starts at the same place the old fixed rail did, but
      // (unlike fixedPx) remains user-draggable.
      sizes: [0.74, 0.26],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        {
          kind: "split",
          dir: "column",
          sizes: [0.5, 0.5],
          children: [
            { kind: "panel", panelId: "fx-analytics" },
            { kind: "panel", panelId: "fx-positions" },
          ],
        },
      ],
    },
    { kind: "panel", panelId: "fx-blotter" },
  ],
};

const CREDIT_ROOT: LayoutNode = {
  kind: "split",
  dir: "row",
  sizes: [0.25, 0.75],
  children: [
    { kind: "panel", panelId: "credit-new-rfq" },
    {
      kind: "split",
      dir: "column",
      sizes: [0.62, 0.38],
      children: [
        { kind: "panel", panelId: "credit-rfqs" },
        { kind: "panel", panelId: "credit-blotter" },
      ],
    },
  ],
};

const ADMIN_ROOT: LayoutNode = { kind: "panel", panelId: "admin-dashboard" };

const EQUITIES_ROOT: LayoutNode = { kind: "panel", panelId: "equities" };

const ROOTS: Record<WorkspaceTab, LayoutNode> = {
  fx: FX_ROOT,
  credit: CREDIT_ROOT,
  admin: ADMIN_ROOT,
  equities: EQUITIES_ROOT,
};

/** The default in-house arrangement for one workspace tab. A future
 * DockviewLayoutEngine would consume a differently-built LayoutPort with the
 * same shape; nothing else changes. */
export function createDefaultLayoutPort(tab: WorkspaceTab): LayoutPort {
  const initial: LayoutState = {
    root: ROOTS[tab],
    maximized: null,
    collapsed: [],
  };
  return { initial };
}
