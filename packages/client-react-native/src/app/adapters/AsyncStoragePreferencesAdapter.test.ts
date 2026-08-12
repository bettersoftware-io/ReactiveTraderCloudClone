import AsyncStorage from "@react-native-async-storage/async-storage";
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  BOOT_VARIANTS,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_LOGIN_WAIT_VARIANT,
  DEFAULT_VIEW_MODE,
  LOGIN_WAIT_VARIANTS,
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

test("emits the default forceBootAnimation (true) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.forceBootAnimation$());
  expect(first).toBe(true);
});

test("hydrates a stored boolean forceBootAnimation value", async () => {
  store.set("rtc-force-boot-animation", "false");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.forceBootAnimation$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe(false);
});

test("setForceBootAnimation writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setForceBootAnimation(true);
  const next = await firstValueFrom(prefs.forceBootAnimation$());
  expect(next).toBe(true);
  expect(store.get("rtc-force-boot-animation")).toBe("true");
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

/**
 * Driven off `BOOT_VARIANTS` rather than a hand-listed set, so a variant added
 * to the domain can never again outrun this adapter's guard: the boot rotation
 * advances through every variant, and one the guard rejects silently resets the
 * sequence to the default on cold launch.
 */
test.each([
  ...BOOT_VARIANTS,
])("hydrates the stored boot variant %s", async (variant) => {
  store.set("rt-boot-variant", variant);
  const prefs = new AsyncStoragePreferencesAdapter();
  // Poll the current value rather than awaiting a second emission: the
  // default variant hydrates to the value the subject already holds, and
  // `distinctUntilChanged` rightly suppresses that duplicate.
  await vi.waitFor(async () => {
    expect(await firstValueFrom(prefs.bootVariant$())).toBe(variant);
  });
});

test("falls back to the default boot variant when the stored value is unknown", async () => {
  store.set("rt-boot-variant", "not-a-real-variant");
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.bootVariant$());
  expect(first).toBe(DEFAULT_BOOT_VARIANT);
});

// The pre-seeded `hydrate()` path is the race fix: a synchronous read (e.g.
// BootPreferencePresenter.current(), taken once at boot-machine construction)
// must see the PERSISTED variant, not the default. Unlike the self-hydrating
// constructor above — where the stored value only arrives on a LATER emission —
// hydrate() seeds it as the FIRST value, so no `skip(1)` is needed here. Driven
// off BOOT_VARIANTS so a new domain variant can't outrun the seed path either.
test.each([
  ...BOOT_VARIANTS,
])("hydrate() seeds the stored boot variant %s on the first emission", async (variant) => {
  store.set("rt-boot-variant", variant);
  const prefs = await AsyncStoragePreferencesAdapter.hydrate();
  // No skip: the first emission is already the persisted value.
  expect(await firstValueFrom(prefs.bootVariant$())).toBe(variant);
});

test("hydrate() seeds defaults when nothing is stored", async () => {
  const prefs = await AsyncStoragePreferencesAdapter.hydrate();
  expect(await firstValueFrom(prefs.bootVariant$())).toBe(DEFAULT_BOOT_VARIANT);
  expect(await firstValueFrom(prefs.viewMode$())).toBe(DEFAULT_VIEW_MODE);
});

test("hydrate() seeds a non-boot preference (theme mode) on the first emission", async () => {
  store.set("rtc-theme", "light");
  const prefs = await AsyncStoragePreferencesAdapter.hydrate();
  expect(await firstValueFrom(prefs.themeMode$())).toBe("light");
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

test("hydrates a stored, non-default ambientStyle after construction", async () => {
  store.set("rtc-ambient-style", "rays");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.ambientStyle$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("rays");
});

test("setAmbientStyle writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setAmbientStyle("rays");
  const next = await firstValueFrom(prefs.ambientStyle$());
  expect(next).toBe("rays");
  expect(store.get("rtc-ambient-style")).toBe("rays");
});

test("hydrates a stored, non-default chartSubstrate after construction", async () => {
  store.set("rtc-chart-substrate", "canvas");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.chartSubstrate$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("canvas");
});

test("setChartSubstrate writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setChartSubstrate("canvas");
  const next = await firstValueFrom(prefs.chartSubstrate$());
  expect(next).toBe("canvas");
  expect(store.get("rtc-chart-substrate")).toBe("canvas");
});

test("emits the default workspaceLayout (null) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.workspaceLayout$());
  expect(first).toBeNull();
});

test("hydrates a stored, non-default workspaceLayout after construction", async () => {
  store.set("rtc-workspace-layout-v1", '{"panels":["fx"]}');
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.workspaceLayout$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe('{"panels":["fx"]}');
});

test("setWorkspaceLayout writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setWorkspaceLayout("layout-a");
  const next = await firstValueFrom(prefs.workspaceLayout$());
  expect(next).toBe("layout-a");
  expect(store.get("rtc-workspace-layout-v1")).toBe("layout-a");
});

test("setWorkspaceLayout(null) removes the stored key rather than writing a literal null", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setWorkspaceLayout("layout-a");
  await firstValueFrom(prefs.workspaceLayout$());
  prefs.setWorkspaceLayout(null);
  const next = await firstValueFrom(prefs.workspaceLayout$());
  expect(next).toBeNull();
  expect(store.has("rtc-workspace-layout-v1")).toBe(false);
});

test("hydrates a stored, non-default layoutEngine after construction", async () => {
  store.set("rtc-layout-engine", "dockview");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.layoutEngine$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("dockview");
});

test("setLayoutEngine writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setLayoutEngine("dockview");
  const next = await firstValueFrom(prefs.layoutEngine$());
  expect(next).toBe("dockview");
  expect(store.get("rtc-layout-engine")).toBe("dockview");
});

test("emits the default jarvisSkin (singularity) synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.jarvisSkin$());
  expect(first).toBe("singularity");
});

test("hydrates a stored, non-default jarvisSkin after construction", async () => {
  store.set("rtc-jarvis-skin", "reactor");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.jarvisSkin$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("reactor");
});

test("setJarvisSkin writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setJarvisSkin("reactor");
  const next = await firstValueFrom(prefs.jarvisSkin$());
  expect(next).toBe("reactor");
  expect(store.get("rtc-jarvis-skin")).toBe("reactor");
});

test("falls back to the default jarvisSkin when the stored value is unknown", async () => {
  store.set("rtc-jarvis-skin", "not-a-real-skin");
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.jarvisSkin$());
  expect(first).toBe("singularity");
});

test("emits the default jarvisBrain and jarvisEffort synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(await firstValueFrom(prefs.jarvisBrain$())).toBe(DEFAULT_JARVIS_BRAIN);
  expect(await firstValueFrom(prefs.jarvisEffort$())).toBe(
    DEFAULT_JARVIS_EFFORT,
  );
});

test("hydrates a stored, non-default jarvisBrain and jarvisEffort after construction", async () => {
  store.set("rt-jarvis-brain", "claude-opus-5");
  store.set("rt-jarvis-effort", "high");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydratedBrain$ = firstValueFrom(
    prefs.jarvisBrain$().pipe(skip(1), take(1)),
  );

  const hydratedEffort$ = firstValueFrom(
    prefs.jarvisEffort$().pipe(skip(1), take(1)),
  );
  expect(await hydratedBrain$).toBe("claude-opus-5");
  expect(await hydratedEffort$).toBe("high");
});

test("setJarvisBrain/setJarvisEffort write through to AsyncStorage and emit", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setJarvisBrain("claude-sonnet-5");
  prefs.setJarvisEffort("low");
  expect(await firstValueFrom(prefs.jarvisBrain$())).toBe("claude-sonnet-5");
  expect(await firstValueFrom(prefs.jarvisEffort$())).toBe("low");
  expect(store.get("rt-jarvis-brain")).toBe("claude-sonnet-5");
  expect(store.get("rt-jarvis-effort")).toBe("low");
});

test("falls back to the default jarvisBrain and jarvisEffort when the stored values are unknown", async () => {
  store.set("rt-jarvis-brain", "not-a-real-brain");
  store.set("rt-jarvis-effort", "not-a-real-effort");
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(await firstValueFrom(prefs.jarvisBrain$())).toBe(DEFAULT_JARVIS_BRAIN);
  expect(await firstValueFrom(prefs.jarvisEffort$())).toBe(
    DEFAULT_JARVIS_EFFORT,
  );
});

test("hydrate() seeds a stored jarvisBrain and jarvisEffort on the first emission", async () => {
  store.set("rt-jarvis-brain", "claude-opus-5");
  store.set("rt-jarvis-effort", "high");
  const prefs = await AsyncStoragePreferencesAdapter.hydrate();
  expect(await firstValueFrom(prefs.jarvisBrain$())).toBe("claude-opus-5");
  expect(await firstValueFrom(prefs.jarvisEffort$())).toBe("high");
});

test("emits the default jarvisNarrator synchronously", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(await firstValueFrom(prefs.jarvisNarrator$())).toBe(
    DEFAULT_JARVIS_NARRATOR,
  );
});

test("hydrates a stored, non-default jarvisNarrator after construction", async () => {
  store.set("rt-jarvis-narrator", "off");
  const prefs = new AsyncStoragePreferencesAdapter();
  const hydrated = await firstValueFrom(
    prefs.jarvisNarrator$().pipe(skip(1), take(1)),
  );
  expect(hydrated).toBe("off");
});

test("setJarvisNarrator writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setJarvisNarrator("off");
  expect(await firstValueFrom(prefs.jarvisNarrator$())).toBe("off");
  expect(store.get("rt-jarvis-narrator")).toBe("off");
});

test("falls back to the default jarvisNarrator when the stored value is unknown", async () => {
  store.set("rt-jarvis-narrator", "not-a-real-preference");
  const prefs = new AsyncStoragePreferencesAdapter();
  expect(await firstValueFrom(prefs.jarvisNarrator$())).toBe(
    DEFAULT_JARVIS_NARRATOR,
  );
});

test("hydrate() seeds a stored jarvisNarrator on the first emission", async () => {
  store.set("rt-jarvis-narrator", "off");
  const prefs = await AsyncStoragePreferencesAdapter.hydrate();
  expect(await firstValueFrom(prefs.jarvisNarrator$())).toBe("off");
});

test("emits the default login-wait variant synchronously on construction", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  const first = await firstValueFrom(prefs.loginWaitVariant$());
  expect(first).toBe(DEFAULT_LOGIN_WAIT_VARIANT);
});

/**
 * Driven off `LOGIN_WAIT_VARIANTS` rather than a hand-listed set, so a variant
 * added to the domain can never again outrun this adapter's guard.
 *
 * Also seeds a companion `rtc-view-mode` value and waits for THAT to flip
 * first: `hydrate()` reads every key in one `Promise.all` batch and every
 * guard runs synchronously right after with no further `await`, so once the
 * companion is visibly hydrated the loginWaitVariant guard has already run
 * too. Without this, the "handshake" iteration (the default) would pass
 * identically whether hydration ran or not — the subject already starts at
 * "handshake" pre-hydration, so a bare wait on loginWaitVariant$ can't tell
 * the two apart.
 */
test.each([
  ...LOGIN_WAIT_VARIANTS,
])("hydrates the stored login-wait variant %s", async (variant) => {
  store.set("rt-login-wait-variant", variant);
  store.set("rtc-view-mode", "price");
  const prefs = new AsyncStoragePreferencesAdapter();
  await vi.waitFor(async () => {
    expect(await firstValueFrom(prefs.viewMode$())).toBe("price");
  });
  expect(await firstValueFrom(prefs.loginWaitVariant$())).toBe(variant);
});

test("falls back to the default login-wait variant when the stored value is unknown", async () => {
  store.set("rt-login-wait-variant", "not-a-real-variant");
  // A companion valid value in the SAME hydrate() batch — Promise.all
  // resolves every key together and every guard runs synchronously right
  // after with no further `await`, so waiting for THIS to visibly flip away
  // from its own default proves hydrate() has already evaluated (and
  // rejected) the invalid loginWaitVariant above. Without it, this assertion
  // would pass identically whether the guard ran or hydrate() never fired at
  // all: an invalid input can never itself produce an observable change to
  // wait on, so a bare `firstValueFrom` here would only ever capture the
  // subject's synchronous pre-hydration default.
  store.set("rtc-view-mode", "price");
  const prefs = new AsyncStoragePreferencesAdapter();
  await vi.waitFor(async () => {
    expect(await firstValueFrom(prefs.viewMode$())).toBe("price");
  });
  const first = await firstValueFrom(prefs.loginWaitVariant$());
  expect(first).toBe(DEFAULT_LOGIN_WAIT_VARIANT);
});

test("setLoginWaitVariant writes through to AsyncStorage and emits", async () => {
  const prefs = new AsyncStoragePreferencesAdapter();
  prefs.setLoginWaitVariant("reactor");
  const next = await firstValueFrom(prefs.loginWaitVariant$());
  expect(next).toBe("reactor");
  expect(store.get("rt-login-wait-variant")).toBe("reactor");
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
      removeItem: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    },
  };
});
