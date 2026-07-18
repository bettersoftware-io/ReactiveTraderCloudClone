import AsyncStorage from "@react-native-async-storage/async-storage";
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_VIEW_MODE,
} from "@rtc/domain";

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

test("emits the default powerSaverLevel (off) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.powerSaverLevel$());
  expect(first).toBe("off");
});

test("hydrates a stored powerSaverLevel value", async () => {
  store.set("rtc-power-saver", "freeze");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.powerSaverLevel$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("freeze");
});

test('hydrates a legacy powerSaver="true" value as level "calm"', async () => {
  store.set("rtc-power-saver", "true");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.powerSaverLevel$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("calm");
});

test("setPowerSaverLevel writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setPowerSaverLevel("freeze");
  const next = await firstValueFrom(prefs.powerSaverLevel$());
  expect(next).toBe("freeze");
  expect(store.get("rtc-power-saver")).toBe("freeze");
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

test("emits the default credit RFQ filter (live) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.creditRfqFilter$());
  expect(first).toBe("live");
});

test("hydrates a stored, non-default credit RFQ filter after construction", async () => {
  store.set("credit-rfqs-filter", "closed");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.creditRfqFilter$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("closed");
});

test("setCreditRfqFilter writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setCreditRfqFilter("all");
  const next = await firstValueFrom(prefs.creditRfqFilter$());
  expect(next).toBe("all");
  expect(store.get("credit-rfqs-filter")).toBe("all");
});

test("emits the default eqWatchlistSort and eqBlotterView synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(await firstValueFrom(prefs.eqWatchlistSort$())).toBe(
    DEFAULT_EQ_WATCHLIST_SORT,
  );
  expect(await firstValueFrom(prefs.eqBlotterView$())).toBe(
    DEFAULT_EQ_BLOTTER_VIEW,
  );
});

test("hydrates a stored eqWatchlistSort and eqBlotterView after construction", async () => {
  store.set("eq-watchlist-sort", "price");
  store.set("eq-blotter-view", "positions");
  const prefs = new AsyncStoragePreferencesAdapter();
  // Subscribe to both streams before awaiting either — hydrate() resolves
  // both subjects in the same Promise.all batch, so awaiting sequentially
  // would let the second subscription's skip(1) discard its only emission.
  const hydratedSort$ = firstValueFrom(
    prefs.eqWatchlistSort$().pipe(skip(1), take(1)),
  );
  const hydratedView$ = firstValueFrom(
    prefs.eqBlotterView$().pipe(skip(1), take(1)),
  );
  expect(await hydratedSort$).toBe("price");
  expect(await hydratedView$).toBe("positions");
});

test("setEqWatchlistSort/setEqBlotterView write through to AsyncStorage and emit", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setEqWatchlistSort("sym");
  prefs.setEqBlotterView("positions");
  expect(await firstValueFrom(prefs.eqWatchlistSort$())).toBe("sym");
  expect(await firstValueFrom(prefs.eqBlotterView$())).toBe("positions");
  expect(store.get("eq-watchlist-sort")).toBe("sym");
  expect(store.get("eq-blotter-view")).toBe("positions");
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
