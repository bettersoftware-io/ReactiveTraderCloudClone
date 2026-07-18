import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
} from "@rtc/domain";
import { describePreferencesPortContract } from "@rtc/domain/ports/__contracts__/PreferencesPortContract";

import {
  ANIMATED_BG_STORAGE_KEY,
  BOOT_VARIANT_STORAGE_KEY,
  CREDIT_RFQ_FILTER_STORAGE_KEY,
  EQ_BLOTTER_VIEW_STORAGE_KEY,
  EQ_WATCHLIST_SORT_STORAGE_KEY,
  FORCE_BOOT_ANIMATION_STORAGE_KEY,
  LocalStoragePreferencesAdapter,
  POWER_SAVER_STORAGE_KEY,
  THEME_SKIN_STORAGE_KEY,
  THEME_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
} from "./LocalStoragePreferencesAdapter";

describe("LocalStoragePreferencesAdapter (jsdom localStorage)", () => {
  beforeEach(clearStorage);
  afterEach(clearStorage);

  describePreferencesPortContract(
    "LocalStoragePreferencesAdapter",
    () => {
      clearStorage();
      return new LocalStoragePreferencesAdapter();
    },
    (seed) => {
      clearStorage();

      if (seed.themeMode) {
        localStorage.setItem(THEME_STORAGE_KEY, seed.themeMode);
      }

      if (seed.themeSkin) {
        localStorage.setItem(THEME_SKIN_STORAGE_KEY, seed.themeSkin);
      }

      if (seed.viewMode) {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, seed.viewMode);
      }

      if (seed.animatedBackground !== undefined) {
        localStorage.setItem(
          ANIMATED_BG_STORAGE_KEY,
          seed.animatedBackground ? "true" : "false",
        );
      }

      if (seed.powerSaverLevel !== undefined) {
        localStorage.setItem(POWER_SAVER_STORAGE_KEY, seed.powerSaverLevel);
      }

      if (seed.forceBootAnimation !== undefined) {
        localStorage.setItem(
          FORCE_BOOT_ANIMATION_STORAGE_KEY,
          seed.forceBootAnimation ? "true" : "false",
        );
      }

      if (seed.bootVariant) {
        localStorage.setItem(BOOT_VARIANT_STORAGE_KEY, seed.bootVariant);
      }

      if (seed.creditRfqFilter) {
        localStorage.setItem(
          CREDIT_RFQ_FILTER_STORAGE_KEY,
          seed.creditRfqFilter,
        );
      }

      if (seed.eqWatchlistSort) {
        localStorage.setItem(
          EQ_WATCHLIST_SORT_STORAGE_KEY,
          seed.eqWatchlistSort,
        );
      }

      if (seed.eqBlotterView) {
        localStorage.setItem(EQ_BLOTTER_VIEW_STORAGE_KEY, seed.eqBlotterView);
      }

      return new LocalStoragePreferencesAdapter();
    },
  );

  it("falls back to defaults for invalid stored values", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, "grid");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.themeMode$())).toBe(DEFAULT_THEME_MODE);
    expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
  });

  it("persists themeMode write back to localStorage", () => {
    const port = new LocalStoragePreferencesAdapter();
    port.setThemeMode("light");
    port.setViewMode("price");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("price");
  });

  it("persists skin, animatedBackground, and powerSaverLevel to their own keys", () => {
    const port = new LocalStoragePreferencesAdapter();
    port.setThemeSkin("terminal");
    port.setAnimatedBackground(true);
    port.setPowerSaverLevel("calm");
    expect(localStorage.getItem(THEME_SKIN_STORAGE_KEY)).toBe("terminal");
    expect(localStorage.getItem(ANIMATED_BG_STORAGE_KEY)).toBe("true");
    expect(localStorage.getItem(POWER_SAVER_STORAGE_KEY)).toBe("calm");
  });

  it('migrates a legacy powerSaver="true" to level "calm"', async () => {
    localStorage.setItem(POWER_SAVER_STORAGE_KEY, "true");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.powerSaverLevel$())).toBe("calm");
  });

  it("reads a stored freeze level back", async () => {
    localStorage.setItem(POWER_SAVER_STORAGE_KEY, "freeze");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.powerSaverLevel$())).toBe("freeze");
  });

  it("keeps reading the legacy rtc-theme key as the mode (back-compat)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.themeMode$())).toBe("light");
  });

  it("falls back to defaults for an invalid stored skin", async () => {
    localStorage.setItem(THEME_SKIN_STORAGE_KEY, "rainbow");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.themeSkin$())).toBe(DEFAULT_THEME_SKIN);
  });

  it("persists eqWatchlistSort and eqBlotterView to their own keys", () => {
    const port = new LocalStoragePreferencesAdapter();
    port.setEqWatchlistSort("price");
    port.setEqBlotterView("positions");
    expect(localStorage.getItem(EQ_WATCHLIST_SORT_STORAGE_KEY)).toBe("price");
    expect(localStorage.getItem(EQ_BLOTTER_VIEW_STORAGE_KEY)).toBe("positions");
  });

  it("falls back to defaults for invalid stored eqWatchlistSort/eqBlotterView", async () => {
    localStorage.setItem(EQ_WATCHLIST_SORT_STORAGE_KEY, "volume");
    localStorage.setItem(EQ_BLOTTER_VIEW_STORAGE_KEY, "trades");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.eqWatchlistSort$())).toBe(
      DEFAULT_EQ_WATCHLIST_SORT,
    );
    expect(await firstValueFrom(port.eqBlotterView$())).toBe(
      DEFAULT_EQ_BLOTTER_VIEW,
    );
  });
});

function clearStorage(): void {
  localStorage.removeItem(THEME_STORAGE_KEY);
  localStorage.removeItem(THEME_SKIN_STORAGE_KEY);
  localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
  localStorage.removeItem(ANIMATED_BG_STORAGE_KEY);
  localStorage.removeItem(BOOT_VARIANT_STORAGE_KEY);
  localStorage.removeItem(CREDIT_RFQ_FILTER_STORAGE_KEY);
  localStorage.removeItem(EQ_WATCHLIST_SORT_STORAGE_KEY);
  localStorage.removeItem(EQ_BLOTTER_VIEW_STORAGE_KEY);
  localStorage.removeItem(POWER_SAVER_STORAGE_KEY);
  localStorage.removeItem(FORCE_BOOT_ANIMATION_STORAGE_KEY);
}
