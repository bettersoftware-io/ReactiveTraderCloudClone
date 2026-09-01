import { describe, expect, it } from "vitest";

import { pairEngineGoldens } from "./enginePairs";

describe("pairEngineGoldens", () => {
  it("pairs every -dockview golden with the same-skin in-house sibling", () => {
    expect(
      pairEngineGoldens([
        "classic-dark/app-fx.png",
        "classic-dark/app-fx-dockview.png",
        "holo3d-light/app-fx-maximized-dockview.png",
        "holo3d-light/app-fx-maximized.png",
      ]),
    ).toEqual([
      {
        inhouse: "classic-dark/app-fx.png",
        dockview: "classic-dark/app-fx-dockview.png",
        skin: "classic-dark",
        scenario: "app-fx",
      },
      {
        inhouse: "holo3d-light/app-fx-maximized.png",
        dockview: "holo3d-light/app-fx-maximized-dockview.png",
        skin: "holo3d-light",
        scenario: "app-fx-maximized",
      },
    ]);
  });

  it("leaves out a dockview golden with no in-house twin, and never pairs across skins", () => {
    expect(
      pairEngineGoldens([
        "classic-dark/shell-layout-dockview.png",
        "classic-dark/layout-fx-default.png",
        "classic-dark/app-fx-dockview.png",
        "classic-light/app-fx.png",
      ]),
    ).toEqual([]);
  });

  it("ignores in-house goldens that merely contain the word dockview", () => {
    expect(pairEngineGoldens(["classic-dark/prefs-dockview-row.png"])).toEqual(
      [],
    );
  });
});
