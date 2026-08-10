import type { DriveTab } from "./driveCommand.js";

/** One desk panel a `layout` drive command can target. */
export interface DeskPanelInfo {
  readonly id: string;
  readonly title: string;
}

/**
 * The per-tab roster of DEFAULT-TREE desk panels — the ids a
 * `DriveCommandV1` `layout` command can actually target. Transport-neutral
 * so both the server persona (the model-facing roster) and the client
 * layout layer can consume one source; the client-core conformance test
 * (`defaultLayoutPort.rosterConformance.test.ts`) pins this against the
 * real layout trees, which the server may not import. Off-tree registered
 * panels (`credit-sell-side`, `eq-depth`, `eq-sectors`) are deliberately
 * absent — a maximize on one of those is a client-side no-op.
 */
export const DESK_PANEL_ROSTER: Record<DriveTab, readonly DeskPanelInfo[]> = {
  fx: [
    { id: "fx-rates", title: "Live Rates" },
    { id: "fx-blotter", title: "Blotter" },
    { id: "fx-analytics", title: "Analytics" },
    { id: "fx-positions", title: "Positions" },
  ],
  credit: [
    { id: "credit-new-rfq", title: "New RFQ" },
    { id: "credit-rfqs", title: "RFQs" },
    { id: "credit-blotter", title: "Credit Blotter" },
  ],
  equities: [
    { id: "eq-chart", title: "Equities" },
    { id: "eq-blotter", title: "Orders & Positions" },
    { id: "eq-ticket", title: "Order Ticket" },
    { id: "eq-watchlist", title: "Watchlist" },
  ],
  admin: [{ id: "admin-dashboard", title: "Admin" }],
};
