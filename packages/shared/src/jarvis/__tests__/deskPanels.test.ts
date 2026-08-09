import { describe, expect, it } from "vitest";
import { DESK_PANEL_ROSTER } from "../deskPanels.js";
import { DRIVE_TABS } from "../driveCommand.js";

describe("DESK_PANEL_ROSTER", () => {
  it("covers every drive tab", () => {
    expect(Object.keys(DESK_PANEL_ROSTER).sort()).toEqual([...DRIVE_TABS].sort());
  });

  it("pins the default-tree panels per tab (ids and titles)", () => {
    expect(DESK_PANEL_ROSTER.fx).toEqual([
      { id: "fx-rates", title: "Live Rates" },
      { id: "fx-blotter", title: "Blotter" },
      { id: "fx-analytics", title: "Analytics" },
      { id: "fx-positions", title: "Positions" },
    ]);
    expect(DESK_PANEL_ROSTER.credit.map((p) => {
      return p.id;
    })).toEqual(["credit-new-rfq", "credit-rfqs", "credit-blotter"]);
    expect(DESK_PANEL_ROSTER.admin).toEqual([
      { id: "admin-dashboard", title: "Admin" },
    ]);
    expect(DESK_PANEL_ROSTER.equities.map((p) => {
      return p.id;
    })).toEqual(["eq-chart", "eq-blotter", "eq-ticket", "eq-watchlist"]);
  });

  it("never lists an off-tree panel", () => {
    const all = Object.values(DESK_PANEL_ROSTER)
      .flat()
      .map((p) => {
        return p.id;
      });

    for (const offTree of ["credit-sell-side", "eq-depth", "eq-sectors"]) {
      expect(all).not.toContain(offTree);
    }
  });
});
