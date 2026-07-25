import { describe, expect, it } from "vitest";

import { fixtures } from "./fixtures";
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
    const combos = Object.keys(scenarios).filter((k) => {
      return k.startsWith("app/fx__");
    });
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

  it("folds the 'system' theme-mode into the classic-dark/ folder (no lone classic-system/)", () => {
    expect(scenarios["app/fx-system"].themeMode).toBe("system");
    expect(goldenPath("app/fx-system", scenarios["app/fx-system"])).toBe(
      "classic-dark/app-fx-system",
    );
    expect(
      goldenPathArray("app/fx-system", scenarios["app/fx-system"]),
    ).toEqual(["classic-dark", "app-fx-system.png"]);
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

describe("scenario referential integrity", () => {
  // Guards the WHOLE registered set, not just a hand-picked sample — a typo'd
  // fixtureKey (e.g. a copy-paste slip) would otherwise only surface as a
  // runtime "Unknown fixture" throw the first time that scenario is actually
  // rendered by a visual tier, rather than failing this fast unit test.
  it("every scenario's fixtureKey resolves to a registered fixture", () => {
    for (const [name, scenario] of Object.entries(scenarios)) {
      expect(
        fixtures[scenario.fixtureKey],
        `scenario "${name}" points at unknown fixtureKey "${scenario.fixtureKey}"`,
      ).toBeDefined();
    }
  });

  // `scenarios` is a plain object, so its own keys are trivially unique by JS
  // semantics — that alone can't catch two DIFFERENT scenario names silently
  // colliding on the same golden PNG path (e.g. a near-miss typo in a base
  // name), which would make one scenario silently overwrite the other's
  // golden file. Compute every golden path and assert none repeat.
  it("no two scenarios collapse onto the same golden path", () => {
    const seenBy = new Map<string, string>();

    for (const [name, scenario] of Object.entries(scenarios)) {
      const path = goldenPath(name, scenario);
      const collidesWith = seenBy.get(path);
      expect(
        collidesWith,
        `scenario "${name}" collides with "${collidesWith}" at golden path "${path}"`,
      ).toBeUndefined();
      seenBy.set(path, name);
    }
  });
});
