import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  nextThemeModePreference,
  resolveThemeMode,
  THEME_MODE_PREFERENCES,
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
    expect(THEME_SKINS).toEqual([
      "classic",
      "holo",
      "holo3d",
      "terminal",
      "terminal3d",
      "neon",
    ]);
  });
});

describe("system theme-mode preference", () => {
  it("lists every preference in cycle order; the default stays dark", () => {
    expect(THEME_MODE_PREFERENCES).toEqual(["dark", "light", "system"]);
    expect(DEFAULT_THEME_MODE_PREFERENCE).toBe("dark");
  });

  it("nextThemeModePreference cycles dark → light → system → dark", () => {
    expect(nextThemeModePreference("dark")).toBe("light");
    expect(nextThemeModePreference("light")).toBe("system");
    expect(nextThemeModePreference("system")).toBe("dark");
  });

  it("resolveThemeMode follows the OS for 'system', passes concrete choices through", () => {
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("light", true)).toBe("light");
  });
});
