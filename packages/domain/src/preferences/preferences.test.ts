import { describe, expect, it } from "vitest";

import {
  AMBIENT_STYLES,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  EQ_WATCHLIST_SORTS,
  isJarvisNarratorPreference,
  isPowerSaverLevel,
  JARVIS_NARRATOR_PREFERENCES,
  nextEqWatchlistSort,
  nextPowerSaverLevel,
  nextThemeModePreference,
  POWER_SAVER_LEVELS,
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

describe("ambient style preference", () => {
  it("defaults to aurora", () => {
    expect(DEFAULT_AMBIENT_STYLE).toBe("aurora");
  });

  it("enumerates aurora and rays in selector order", () => {
    expect(AMBIENT_STYLES).toEqual(["aurora", "rays"]);
  });
});

describe("power-saver preference", () => {
  it("defaults to off and enumerates the header cycle in order", () => {
    expect(DEFAULT_POWER_SAVER_LEVEL).toBe("off");
    expect(POWER_SAVER_LEVELS).toEqual(["off", "calm", "freeze"]);
  });

  it("cycles off -> calm -> freeze and wraps back to off", () => {
    // The wrap is the interesting arm: `(i + 1) % length` is what stops the
    // header button dead-ending on freeze.
    expect(nextPowerSaverLevel("off")).toBe("calm");
    expect(nextPowerSaverLevel("calm")).toBe("freeze");
    expect(nextPowerSaverLevel("freeze")).toBe("off");
  });

  it("returns to a valid level from every level in one full cycle", () => {
    // Guards the ?? fallback staying unreachable for real inputs: three steps
    // from any level must land back on itself.
    for (const level of POWER_SAVER_LEVELS) {
      const cycled = nextPowerSaverLevel(
        nextPowerSaverLevel(nextPowerSaverLevel(level)),
      );

      expect(cycled).toBe(level);
    }
  });

  it("accepts exactly the three stored level strings", () => {
    for (const level of POWER_SAVER_LEVELS) {
      expect(isPowerSaverLevel(level)).toBe(true);
    }
  });

  it("rejects null, empty and legacy boolean strings", () => {
    // Adapters migrate the legacy `"true"` boolean to `"calm"` before this
    // guard sees it, so the guard itself must NOT accept it.
    expect(isPowerSaverLevel(null)).toBe(false);
    expect(isPowerSaverLevel("")).toBe(false);
    expect(isPowerSaverLevel("true")).toBe(false);
    expect(isPowerSaverLevel("Off")).toBe(false);
  });
});

describe("jarvis narrator preference", () => {
  it("defaults to on and enumerates on/off in toggle order", () => {
    expect(DEFAULT_JARVIS_NARRATOR).toBe("on");
    expect(JARVIS_NARRATOR_PREFERENCES).toEqual(["on", "off"]);
  });

  it("accepts exactly the two stored preference strings", () => {
    for (const pref of JARVIS_NARRATOR_PREFERENCES) {
      expect(isJarvisNarratorPreference(pref)).toBe(true);
    }
  });

  it("rejects null, undefined, empty, and anything outside the closed union", () => {
    expect(isJarvisNarratorPreference(null)).toBe(false);
    expect(isJarvisNarratorPreference(undefined)).toBe(false);
    expect(isJarvisNarratorPreference("")).toBe(false);
    expect(isJarvisNarratorPreference("On")).toBe(false);
    expect(isJarvisNarratorPreference("true")).toBe(false);
  });
});
