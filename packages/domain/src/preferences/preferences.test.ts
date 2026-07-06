import { describe, expect, it } from "vitest";

import {
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  EQ_WATCHLIST_SORTS,
  nextEqWatchlistSort,
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

describe("equities watchlist-sort preference", () => {
  it("lists every sort in cycle order; the default is chg", () => {
    expect(EQ_WATCHLIST_SORTS).toEqual(["sym", "chg", "price"]);
    expect(DEFAULT_EQ_WATCHLIST_SORT).toBe("chg");
  });

  it("nextEqWatchlistSort cycles sym → chg → price → sym", () => {
    expect(nextEqWatchlistSort("sym")).toBe("chg");
    expect(nextEqWatchlistSort("chg")).toBe("price");
    expect(nextEqWatchlistSort("price")).toBe("sym");
  });
});

describe("equities blotter-view preference", () => {
  it("defaults to orders", () => {
    expect(DEFAULT_EQ_BLOTTER_VIEW).toBe("orders");
  });
});
