import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  THEME_MODES,
  THEME_SKINS,
  type ThemeMode,
  type ThemeSkin,
} from "./preferences.js";

describe("theme axis value types", () => {
  it("defaults match the pinned interface contract", () => {
    const mode: ThemeMode = DEFAULT_THEME_MODE;
    const skin: ThemeSkin = DEFAULT_THEME_SKIN;
    expect(mode).toBe("dark");
    expect(skin).toBe("holo");
  });

  it("enumerations list every member in canonical order", () => {
    expect(THEME_MODES).toEqual(["dark", "light"]);
    expect(THEME_SKINS).toEqual(["classic", "holo", "terminal", "neon"]);
  });
});
