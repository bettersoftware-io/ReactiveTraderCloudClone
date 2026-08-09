import { describe, expect, it } from "vitest";

import { DESK_PANEL_ROSTER } from "@rtc/shared";

import { LAYOUT_PANEL_IDS } from "../composition.js";
import { PANEL_SPECS } from "./defaultLayoutPort.js";

describe("DESK_PANEL_ROSTER ↔ defaultLayoutPort conformance", () => {
  it("roster ids per tab equal the default-tree ids (order included)", () => {
    for (const tab of ["fx", "credit", "equities", "admin"] as const) {
      expect(DESK_PANEL_ROSTER[tab].map((p) => {
        return p.id;
      })).toEqual([...LAYOUT_PANEL_IDS[tab]]);
    }
  });

  it("roster titles match PANEL_SPECS titles", () => {
    for (const panels of Object.values(DESK_PANEL_ROSTER)) {
      for (const panel of panels) {
        expect(PANEL_SPECS[panel.id]?.title).toBe(panel.title);
      }
    }
  });
});
