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
  // The rail panels (FX analytics/positions, Equities ticket/watchlist)
  // maximize within their own column per the standalone design: only the
  // column sibling strips; the main column and the rail width stay put.
  "fx-analytics": {
    id: "fx-analytics",
    title: "Analytics",
    maximizeScope: "nearest-column",
  },
  "fx-positions": {
    id: "fx-positions",
    title: "Positions",
    maximizeScope: "nearest-column",
  },
  "fx-blotter": { id: "fx-blotter", title: "Blotter" },
  // The New RFQ entry form never fills the dock itself (maximizable: false —
  // its head keeps only the collapse control), but it still strips when a
  // sibling maximizes, per the standalone design.
  "credit-new-rfq": {
    id: "credit-new-rfq",
    title: "New RFQ",
    maximizable: false,
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
  },
  "eq-watchlist": {
    id: "eq-watchlist",
    title: "Watchlist",
    maximizeScope: "nearest-column",
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
 * analytics/positions 0.5/0.5. The rail opens at the prototype's 360px
 * design width (initialPx — still draggable; the first drag converts the
 * split to plain fractions). */
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

// The New RFQ rail opens at the prototype's 330px design width (initialPx —
// still draggable; the first drag converts the split to plain fractions).
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

// The ticket/watchlist rail opens at the prototype's 290px design width
// (initialPx — still draggable; the first drag converts to plain fractions).
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
export function createDefaultLayoutPort(tab: WorkspaceTab): LayoutPort {
  const initial: LayoutState = {
    root: ROOTS[tab],
    maximized: null,
    collapsed: [],
  };
  return { initial };
}
