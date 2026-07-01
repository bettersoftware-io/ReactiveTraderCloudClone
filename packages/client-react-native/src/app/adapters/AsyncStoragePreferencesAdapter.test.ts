import AsyncStorage from "@react-native-async-storage/async-storage";
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { DEFAULT_VIEW_MODE } from "@rtc/domain";

import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("emits the default view mode synchronously on construction", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.viewMode$());
  expect(first).toBe(DEFAULT_VIEW_MODE);
});

test("hydrates a stored, non-default view mode after construction", async () => {
  store.set("rtc-view-mode", "price");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.viewMode$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("price");
});

test("setViewMode writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setViewMode("price");
  const next = await firstValueFrom(prefs.viewMode$());
  expect(next).toBe("price");
  expect(store.get("rtc-view-mode")).toBe("price");
});

test("emits the default animated-background (false) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.animatedBackground$());
  expect(first).toBe(false);
});

test("hydrates a stored boolean animated-background value", async () => {
  store.set("rtc-animated-bg", "true");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.animatedBackground$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe(true);
});

test("hydrates a stored theme mode", async () => {
  store.set("rtc-theme", "light");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.themeMode$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("light");
});

test("ignores an invalid stored theme mode and keeps the default", async () => {
  store.set("rtc-theme", "not-a-real-mode");
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.themeMode$());
  expect(first).toBe("dark");
});

test("keeps the default view mode when AsyncStorage.getItem rejects", async () => {
  vi.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("boom"));
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.viewMode$());
  expect(first).toBe(DEFAULT_VIEW_MODE);
});

test("setViewMode does not throw when AsyncStorage.setItem rejects", async () => {
  vi.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("boom"));
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(() => {
    prefs.setViewMode("price");
  }).not.toThrow();
  const next = await firstValueFrom(prefs.viewMode$());
  expect(next).toBe("price");
});

vi.mock("@react-native-async-storage/async-storage", () => {
  return {
    default: {
      getItem: (key: string) => {
        return Promise.resolve(store.get(key) ?? null);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    },
  };
});
