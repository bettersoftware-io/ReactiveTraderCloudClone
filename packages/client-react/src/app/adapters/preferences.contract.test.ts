import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, DEFAULT_VIEW_MODE } from "@rtc/domain";
import { describePreferencesPortContract } from "@rtc/domain/ports/__contracts__/PreferencesPortContract";

import {
  LocalStoragePreferencesAdapter,
  THEME_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
} from "./LocalStoragePreferencesAdapter";

function clearStorage() {
  localStorage.removeItem(THEME_STORAGE_KEY);
  localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
}

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
      if (seed.theme) localStorage.setItem(THEME_STORAGE_KEY, seed.theme);
      if (seed.viewMode)
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, seed.viewMode);
      return new LocalStoragePreferencesAdapter();
    },
  );

  it("falls back to defaults for invalid stored values", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, "grid");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.theme$())).toBe(DEFAULT_THEME);
    expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
  });

  it("persists writes back to localStorage", () => {
    const port = new LocalStoragePreferencesAdapter();
    port.setTheme("light");
    port.setViewMode("price");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("price");
  });
});
