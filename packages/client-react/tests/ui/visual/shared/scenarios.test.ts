import { describe, expect, it } from "vitest";

import { goldenPath, goldenPathArray } from "./goldenPath";
import { MATRIX_MODES, MATRIX_SKINS, scenarios } from "./scenarios";

describe("theme-matrix expansion", () => {
  it("emits every skin×mode combo (incl. classic-dark) for an expandable base", () => {
    expect(scenarios["app/fx__classic-dark"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx",
      themeSkin: "classic",
      themeMode: "dark",
    });
    expect(scenarios["app/fx__holo3d-light"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx",
      themeSkin: "holo3d",
      themeMode: "light",
    });
  });

  it("replaces the bare base key with combos (no un-suffixed app/fx)", () => {
    expect(scenarios["app/fx"]).toBeUndefined();
  });

  it("yields exactly 10 combos per expandable base and excludes neon", () => {
    expect(MATRIX_SKINS).not.toContain("neon");
    const combos = Object.keys(scenarios).filter((k) =>
      k.startsWith("app/fx__"),
    );
    expect(combos).toHaveLength(MATRIX_SKINS.length * MATRIX_MODES.length); // 5×2 = 10
  });

  it("keeps mode-cycle scenarios un-expanded but with explicit theme fields", () => {
    expect(scenarios["app/fx-light__holo-dark"]).toBeUndefined();
    expect(scenarios["app/fx-light"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx-light",
      themeSkin: "classic",
      themeMode: "light",
    });
  });

  it("routes goldens into a <skin>-<mode>/ folder by base name", () => {
    expect(
      goldenPath("app/fx__terminal-light", scenarios["app/fx__terminal-light"]),
    ).toBe("terminal-light/app-fx");
    expect(goldenPath("app/fx-light", scenarios["app/fx-light"])).toBe(
      "classic-light/app-fx-light",
    );
  });

  it("goldenPathArray splits into [folder, file.png] for Playwright's array arg", () => {
    expect(
      goldenPathArray(
        "app/fx__terminal-light",
        scenarios["app/fx__terminal-light"],
      ),
    ).toEqual(["terminal-light", "app-fx.png"]);
    expect(goldenPathArray("app/fx-light", scenarios["app/fx-light"])).toEqual([
      "classic-light",
      "app-fx-light.png",
    ]);
  });
});
