import type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelSpec,
  WorkspaceTab,
} from "@rtc/core-api";

/** Static panel descriptors. `pinned: true` (unused by any default tree today)
 * marks a panel the engine renders in a fixed bottom strip, kept out of any
 * resizable split's sizes so a drag never touches it — the machinery stays
 * for a future panel that genuinely needs to opt out of resizing; no default
 * tree uses it. The five rail panels (FX analytics/positions, Credit New
 * RFQ, Equities ticket/watchlist) are instead width-locked via
 * `fixedWidthPx`, at the same px values their seed's `initialPx` already
 * allocates them — the lock is per-panel-spec, not per-tree-slot, so it holds
 * wherever the panel docks. Ids are stable — the PanelRegistry (Task 5) maps
 * them to module roots. */
export const PANEL_SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  "fx-rates": { id: "fx-rates", title: "Live Rates" },
  // The rail panels (FX analytics/positions, Equities ticket/watchlist)
  // maximize within their own column per the standalone design: only the
  // column sibling strips; the main column and the rail width stay put.
  "fx-analytics": {
    id: "fx-analytics",
    title: "Analytics",
    maximizeScope: "nearest-column",
    fixedWidthPx: 360,
  },
  "fx-positions": {
    id: "fx-positions",
    title: "Positions",
    maximizeScope: "nearest-column",
    fixedWidthPx: 360,
  },
  "fx-blotter": { id: "fx-blotter", title: "Blotter" },
  // The New RFQ entry form never fills the dock itself (maximizable: false —
  // its head keeps only the collapse control), but it still strips when a
  // sibling maximizes, per the standalone design.
  "credit-new-rfq": {
    id: "credit-new-rfq",
    title: "New RFQ",
    maximizable: false,
    fixedWidthPx: 330,
  },
  "credit-rfqs": { id: "credit-rfqs", title: "RFQs" },
  "credit-blotter": { id: "credit-blotter", title: "Credit Blotter" },
  // Registered like every other spec, but not part of CREDIT_ROOT — it has no
  // dock slot yet (Task 4 flips the tabbed workspace to the three-panel dock;
  // sell-side isn't one of the three).
  "credit-sell-side": { id: "credit-sell-side", title: "Sell Side" },
  "admin-dashboard": { id: "admin-dashboard", title: "Admin" },
  "eq-chart": { id: "eq-chart", title: "Equities" },
  "eq-blotter": { id: "eq-blotter", title: "Orders & Positions" },
  "eq-ticket": {
    id: "eq-ticket",
    title: "Order Ticket",
    maximizeScope: "nearest-column",
    fixedWidthPx: 290,
  },
  "eq-watchlist": {
    id: "eq-watchlist",
    title: "Watchlist",
    maximizeScope: "nearest-column",
    fixedWidthPx: 290,
  },
  // Registered so the panel registries can resolve them, but not placed in
  // EQUITIES_ROOT below — both survive outside the default dock, mounted
  // directly (visual/contract specs mount them standalone; see Task 6 brief).
  "eq-depth": { id: "eq-depth", title: "Depth" },
  "eq-sectors": { id: "eq-sectors", title: "Sectors" },
};

/** Prototype FX dock shape (same as EQUITIES_ROOT): a full-height right rail
 * (analytics over positions) beside a left column where the blotter sits
 * under the tiles ONLY — it does not span the rail's width. Ratios are the
 * prototype defaults: main split 0.73/0.27, tiles/blotter 0.66/0.34,
 * analytics/positions 0.5/0.5. `initialPx` is the first-layout allocation for
 * the rail (the prototype's 360px design width); the width LOCK itself comes
 * from the rail panels' `fixedWidthPx`, not from this seed value. */
const FX_ROOT: LayoutNode = {
  kind: "split",
  dir: "row",
  sizes: [0.73, 0.27],
  initialPx: [undefined, 360],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.66, 0.34],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
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
};

// initialPx is the first-layout allocation for the New RFQ rail (the
// prototype's 330px design width); the width lock comes from the panel's
// fixedWidthPx, not from this seed value.
const CREDIT_ROOT: LayoutNode = {
  kind: "split",
  dir: "row",
  sizes: [0.25, 0.75],
  initialPx: [330, undefined],
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

// initialPx is the first-layout allocation for the ticket/watchlist rail (the
// prototype's 290px design width); the width lock comes from the panels'
// fixedWidthPx, not from this seed value.
const EQUITIES_ROOT: LayoutNode = {
  kind: "split",
  dir: "row",
  sizes: [0.78, 0.22],
  initialPx: [undefined, 290],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.66, 0.34],
      children: [
        { kind: "panel", panelId: "eq-chart" },
        { kind: "panel", panelId: "eq-blotter" },
      ],
    },
    {
      kind: "split",
      dir: "column",
      sizes: [0.5, 0.5],
      children: [
        { kind: "panel", panelId: "eq-ticket" },
        { kind: "panel", panelId: "eq-watchlist" },
      ],
    },
  ],
};

const ROOTS: Record<WorkspaceTab, LayoutNode> = {
  fx: FX_ROOT,
  credit: CREDIT_ROOT,
  admin: ADMIN_ROOT,
  equities: EQUITIES_ROOT,
};

/** The default in-house arrangement for one workspace tab. A future
 * DockviewLayoutEngine would consume a differently-built LayoutPort with the
 * same shape; nothing else changes. */
/** The tab's static seed leaves, in tree order — the View menu's row source
 * and the same id set the layout machine derives its floor from. Reads the
 * SEED (not a live root), so docked Jarvis leaves and closed panels never
 * leak in. */
export function staticPanelIdsFor(tab: WorkspaceTab): readonly PanelId[] {
  return collectPanelIds(ROOTS[tab]);
}

function collectPanelIds(node: LayoutNode): readonly PanelId[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

export function createDefaultLayoutPort(tab: WorkspaceTab): LayoutPort {
  const initial: LayoutState = {
    root: ROOTS[tab],
    maximized: null,
    collapsed: [],
    closed: [],
    instances: [],
  };
  return { initial };
}
