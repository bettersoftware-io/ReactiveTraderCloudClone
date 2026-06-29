import type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelSpec,
} from "./layoutPort";

export type WorkspaceTab = "fx" | "credit" | "admin" | "equities";

/** Static panel descriptors. `pinned: true` marks a panel the engine renders in
 * the fixed bottom strip (the blotters), kept out of any resizable split's sizes
 * so a drag never touches it. Ids are stable — the PanelRegistry (Task 5) maps
 * them to module roots. */
export const PANEL_SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  "fx-rates": { id: "fx-rates", title: "Live Rates" },
  "fx-analytics": { id: "fx-analytics", title: "Analytics" },
  "fx-blotter": { id: "fx-blotter", title: "Blotter", pinned: true },
  "credit-rfqs": { id: "credit-rfqs", title: "Credit" },
  "credit-blotter": {
    id: "credit-blotter",
    title: "Credit Blotter",
    pinned: true,
  },
  "admin-throughput": { id: "admin-throughput", title: "Throughput Control" },
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
      sizes: [0.7, 0.3],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-analytics" },
      ],
    },
    { kind: "panel", panelId: "fx-blotter" },
  ],
};

const CREDIT_ROOT: LayoutNode = {
  kind: "split",
  dir: "column",
  sizes: [0.7, 0.3],
  children: [
    { kind: "panel", panelId: "credit-rfqs" },
    { kind: "panel", panelId: "credit-blotter" },
  ],
};

const ADMIN_ROOT: LayoutNode = { kind: "panel", panelId: "admin-throughput" };

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
