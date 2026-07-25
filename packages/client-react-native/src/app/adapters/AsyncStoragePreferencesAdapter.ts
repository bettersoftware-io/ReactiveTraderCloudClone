import AsyncStorage from "@react-native-async-storage/async-storage";
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  AMBIENT_STYLES,
  type AmbientStyle,
  BOOT_VARIANTS,
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  EQ_WATCHLIST_SORTS,
  type EqBlotterView,
  type EqWatchlistSort,
  isPowerSaverLevel,
  type PowerSaverLevel,
  type PreferencesPort,
  THEME_SKINS,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

export const THEME_STORAGE_KEY = "rtc-theme"; // stores the theme mode
export const THEME_SKIN_STORAGE_KEY = "rtc-theme-skin";
export const VIEW_MODE_STORAGE_KEY = "rtc-view-mode";
export const ANIMATED_BG_STORAGE_KEY = "rtc-animated-bg";
export const POWER_SAVER_STORAGE_KEY = "rtc-power-saver";
export const FORCE_BOOT_ANIMATION_STORAGE_KEY = "rtc-force-boot-animation";
export const BOOT_VARIANT_STORAGE_KEY = "rt-boot-variant";
export const CREDIT_RFQ_FILTER_STORAGE_KEY = "credit-rfqs-filter";
export const EQ_WATCHLIST_SORT_STORAGE_KEY = "eq-watchlist-sort";
export const EQ_BLOTTER_VIEW_STORAGE_KEY = "eq-blotter-view";
export const AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style";

function isAmbientStyle(value: string | null): value is AmbientStyle {
  return (
    value !== null && (AMBIENT_STYLES as readonly string[]).includes(value)
  );
}

function isThemeModePreference(
  value: string | null,
): value is ThemeModePreference {
  return value === "dark" || value === "light" || value === "system";
}

function isThemeSkin(value: string | null): value is ThemeSkin {
  return value !== null && (THEME_SKINS as readonly string[]).includes(value);
}

function isViewMode(value: string | null): value is ViewMode {
  return value === "chart" || value === "price";
}

function isBootVariant(value: string | null): value is BootVariant {
  return value !== null && (BOOT_VARIANTS as readonly string[]).includes(value);
}

function isCreditRfqFilter(value: string | null): value is CreditRfqFilter {
  return value === "live" || value === "closed" || value === "all";
}

function isEqWatchlistSort(value: string | null): value is EqWatchlistSort {
  return (
    value !== null && (EQ_WATCHLIST_SORTS as readonly string[]).includes(value)
  );
}

function isEqBlotterView(value: string | null): value is EqBlotterView {
  return value === "orders" || value === "positions";
}

/** The validated subset of stored preference values — only keys whose stored
 * string passed its guard are present. Shared by both construction paths so
 * the read + validation (including the legacy `powerSaver="true"→"calm"` and
 * `animatedBg` string→bool mappings) lives in exactly one place. */
interface StoredPreferences {
  themeMode?: ThemeModePreference;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBg?: boolean;
  powerSaver?: PowerSaverLevel;
  forceBootAnimation?: boolean;
  bootVariant?: BootVariant;
  creditRfqFilter?: CreditRfqFilter;
  eqWatchlistSort?: EqWatchlistSort;
  eqBlotterView?: EqBlotterView;
  ambientStyle?: AmbientStyle;
}

/** Read every preference key from AsyncStorage once and return the validated,
 * mapped values. Tolerant of unavailable storage (returns `{}`, i.e. all
 * defaults). Feeds both the pre-seeded `hydrate()` path and the self-hydrating
 * constructor fallback. */
async function readStoredPreferences(): Promise<StoredPreferences> {
  try {
    const [
      themeMode,
      themeSkin,
      viewMode,
      animatedBg,
      powerSaver,
      forceBootAnimation,
      bootVariant,
      creditRfqFilter,
      eqWatchlistSort,
      eqBlotterView,
      ambientStyle,
    ] = await Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(THEME_SKIN_STORAGE_KEY),
      AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY),
      AsyncStorage.getItem(ANIMATED_BG_STORAGE_KEY),
      AsyncStorage.getItem(POWER_SAVER_STORAGE_KEY),
      AsyncStorage.getItem(FORCE_BOOT_ANIMATION_STORAGE_KEY),
      AsyncStorage.getItem(BOOT_VARIANT_STORAGE_KEY),
      AsyncStorage.getItem(CREDIT_RFQ_FILTER_STORAGE_KEY),
      AsyncStorage.getItem(EQ_WATCHLIST_SORT_STORAGE_KEY),
      AsyncStorage.getItem(EQ_BLOTTER_VIEW_STORAGE_KEY),
      AsyncStorage.getItem(AMBIENT_STYLE_STORAGE_KEY),
    ]);

    const stored: StoredPreferences = {};

    if (isThemeModePreference(themeMode)) {
      stored.themeMode = themeMode;
    }

    if (isThemeSkin(themeSkin)) {
      stored.themeSkin = themeSkin;
    }

    if (isViewMode(viewMode)) {
      stored.viewMode = viewMode;
    }

    if (animatedBg === "true") {
      stored.animatedBg = true;
    } else if (animatedBg === "false") {
      stored.animatedBg = false;
    }

    if (isPowerSaverLevel(powerSaver)) {
      stored.powerSaver = powerSaver;
    } else if (powerSaver === "true") {
      stored.powerSaver = "calm";
    }

    if (forceBootAnimation === "true") {
      stored.forceBootAnimation = true;
    } else if (forceBootAnimation === "false") {
      stored.forceBootAnimation = false;
    }

    if (isBootVariant(bootVariant)) {
      stored.bootVariant = bootVariant;
    }

    if (isCreditRfqFilter(creditRfqFilter)) {
      stored.creditRfqFilter = creditRfqFilter;
    }

    if (isEqWatchlistSort(eqWatchlistSort)) {
      stored.eqWatchlistSort = eqWatchlistSort;
    }

    if (isEqBlotterView(eqBlotterView)) {
      stored.eqBlotterView = eqBlotterView;
    }

    if (isAmbientStyle(ambientStyle)) {
      stored.ambientStyle = ambientStyle;
    }

    return stored;
  } catch {
    // AsyncStorage may be unavailable — fall back to all defaults.
    return {};
  }
}

/**
 * AsyncStorage-backed PreferencesPort for the RN client. AsyncStorage has no
 * synchronous read, so each BehaviorSubject seeds synchronously on construction
 * (satisfying the port's no-flash, replay-current contract). There are two
 * construction paths:
 *
 *   - `await AsyncStoragePreferencesAdapter.hydrate()` — reads the store first
 *     and seeds every subject with its PERSISTED value, so a synchronous read
 *     (e.g. `BootPreferencePresenter.current()`, taken once at boot-machine
 *     construction) sees the persisted value rather than the default. This is
 *     the path the composition root uses (`_layout.tsx` gates `AppRoot`'s mount
 *     on it, exactly like `AsyncStorageSessionStore.hydrate()`).
 *   - `new AsyncStoragePreferencesAdapter()` — seeds with DEFAULTS synchronously
 *     then reads the store asynchronously and `.next()`s any stored value it
 *     finds. Used as a fallback (and by the adapter's unit tests). Fine for
 *     Observable consumers, which pick up the later emission; NOT safe for a
 *     synchronous read that races the async load — hence the pre-seeded path.
 *
 * `set*` writes through to AsyncStorage (fire-and-forget) and pushes the new
 * value synchronously. Mirrors `LocalStoragePreferencesAdapter`'s keys, guards,
 * and defaults so the two adapters stay behaviourally interchangeable.
 */
export class AsyncStoragePreferencesAdapter implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeModePreference>;
  private readonly themeSkin: BehaviorSubject<ThemeSkin>;
  private readonly viewMode: BehaviorSubject<ViewMode>;
  // Intentionally off by default on mobile, overriding the web-oriented
  // DEFAULT_ANIMATED_BACKGROUND (true): the native RN backdrop is not the
  // compositor-only CSS the web ships, and an always-animating layer is a
  // battery cost on device. A user's explicit choice still persists.
  private readonly animatedBg: BehaviorSubject<boolean>;
  private readonly powerSaverSubject: BehaviorSubject<PowerSaverLevel>;
  private readonly forceBootAnimationSubject: BehaviorSubject<boolean>;
  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;
  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;
  private readonly eqWatchlistSortSubject: BehaviorSubject<EqWatchlistSort>;
  private readonly eqBlotterViewSubject: BehaviorSubject<EqBlotterView>;
  private readonly ambientStyle: BehaviorSubject<AmbientStyle>;

  /** When `seed` is provided (the `hydrate()` path) every subject starts on its
   * persisted value and NO async load runs. When omitted, subjects start on
   * defaults and `selfHydrate()` reads the store asynchronously. */
  constructor(seed?: StoredPreferences) {
    const s = seed ?? {};
    this.themeMode = new BehaviorSubject<ThemeModePreference>(
      s.themeMode ?? DEFAULT_THEME_MODE_PREFERENCE,
    );
    this.themeSkin = new BehaviorSubject<ThemeSkin>(
      s.themeSkin ?? DEFAULT_THEME_SKIN,
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      s.viewMode ?? DEFAULT_VIEW_MODE,
    );
    this.animatedBg = new BehaviorSubject<boolean>(s.animatedBg ?? false);
    this.powerSaverSubject = new BehaviorSubject<PowerSaverLevel>(
      s.powerSaver ?? DEFAULT_POWER_SAVER_LEVEL,
    );
    this.forceBootAnimationSubject = new BehaviorSubject<boolean>(
      s.forceBootAnimation ?? DEFAULT_FORCE_BOOT_ANIMATION,
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      s.bootVariant ?? DEFAULT_BOOT_VARIANT,
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      s.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER,
    );
    this.eqWatchlistSortSubject = new BehaviorSubject<EqWatchlistSort>(
      s.eqWatchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT,
    );
    this.eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
      s.eqBlotterView ?? DEFAULT_EQ_BLOTTER_VIEW,
    );
    this.ambientStyle = new BehaviorSubject<AmbientStyle>(
      s.ambientStyle ?? DEFAULT_AMBIENT_STYLE,
    );

    if (seed === undefined) {
      void this.selfHydrate();
    }
  }

  /** Pre-seeded factory: reads the store, then returns an adapter whose every
   * subject already holds its persisted value. The composition root awaits this
   * before mounting so synchronous reads never race the load. */
  static async hydrate(): Promise<AsyncStoragePreferencesAdapter> {
    return new AsyncStoragePreferencesAdapter(await readStoredPreferences());
  }

  /** Fallback async load for the no-seed constructor: read the store and push
   * any stored value onto its subject (defaults already seeded synchronously). */
  private async selfHydrate(): Promise<void> {
    const s = await readStoredPreferences();

    if (s.themeMode !== undefined) {
      this.themeMode.next(s.themeMode);
    }

    if (s.themeSkin !== undefined) {
      this.themeSkin.next(s.themeSkin);
    }

    if (s.viewMode !== undefined) {
      this.viewMode.next(s.viewMode);
    }

    if (s.animatedBg !== undefined) {
      this.animatedBg.next(s.animatedBg);
    }

    if (s.powerSaver !== undefined) {
      this.powerSaverSubject.next(s.powerSaver);
    }

    if (s.forceBootAnimation !== undefined) {
      this.forceBootAnimationSubject.next(s.forceBootAnimation);
    }

    if (s.bootVariant !== undefined) {
      this.bootVariantSubject.next(s.bootVariant);
    }

    if (s.creditRfqFilter !== undefined) {
      this.creditRfqFilterSubject.next(s.creditRfqFilter);
    }

    if (s.eqWatchlistSort !== undefined) {
      this.eqWatchlistSortSubject.next(s.eqWatchlistSort);
    }

    if (s.eqBlotterView !== undefined) {
      this.eqBlotterViewSubject.next(s.eqBlotterView);
    }

    if (s.ambientStyle !== undefined) {
      this.ambientStyle.next(s.ambientStyle);
    }
  }

  themeMode$(): Observable<ThemeModePreference> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeModePreference): void {
    void AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
    this.themeMode.next(mode);
  }

  themeSkin$(): Observable<ThemeSkin> {
    return this.themeSkin.pipe(distinctUntilChanged());
  }

  setThemeSkin(skin: ThemeSkin): void {
    void AsyncStorage.setItem(THEME_SKIN_STORAGE_KEY, skin).catch(() => {});
    this.themeSkin.next(skin);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    void AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode).catch(() => {});
    this.viewMode.next(viewMode);
  }

  animatedBackground$(): Observable<boolean> {
    return this.animatedBg.pipe(distinctUntilChanged());
  }

  setAnimatedBackground(on: boolean): void {
    void AsyncStorage.setItem(
      ANIMATED_BG_STORAGE_KEY,
      on ? "true" : "false",
    ).catch(() => {});
    this.animatedBg.next(on);
  }

  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    void AsyncStorage.setItem(POWER_SAVER_STORAGE_KEY, level).catch(() => {});
    this.powerSaverSubject.next(level);
  }

  forceBootAnimation$(): Observable<boolean> {
    return this.forceBootAnimationSubject.pipe(distinctUntilChanged());
  }

  setForceBootAnimation(on: boolean): void {
    void AsyncStorage.setItem(
      FORCE_BOOT_ANIMATION_STORAGE_KEY,
      on ? "true" : "false",
    ).catch(() => {});
    this.forceBootAnimationSubject.next(on);
  }

  bootVariant$(): Observable<BootVariant> {
    return this.bootVariantSubject.pipe(distinctUntilChanged());
  }

  setBootVariant(variant: BootVariant): void {
    void AsyncStorage.setItem(BOOT_VARIANT_STORAGE_KEY, variant).catch(
      () => {},
    );
    this.bootVariantSubject.next(variant);
  }

  creditRfqFilter$(): Observable<CreditRfqFilter> {
    return this.creditRfqFilterSubject.pipe(distinctUntilChanged());
  }

  setCreditRfqFilter(filter: CreditRfqFilter): void {
    void AsyncStorage.setItem(CREDIT_RFQ_FILTER_STORAGE_KEY, filter).catch(
      () => {},
    );
    this.creditRfqFilterSubject.next(filter);
  }

  eqWatchlistSort$(): Observable<EqWatchlistSort> {
    return this.eqWatchlistSortSubject.pipe(distinctUntilChanged());
  }

  setEqWatchlistSort(sort: EqWatchlistSort): void {
    void AsyncStorage.setItem(EQ_WATCHLIST_SORT_STORAGE_KEY, sort).catch(
      () => {},
    );
    this.eqWatchlistSortSubject.next(sort);
  }

  eqBlotterView$(): Observable<EqBlotterView> {
    return this.eqBlotterViewSubject.pipe(distinctUntilChanged());
  }

  setEqBlotterView(view: EqBlotterView): void {
    void AsyncStorage.setItem(EQ_BLOTTER_VIEW_STORAGE_KEY, view).catch(
      () => {},
    );
    this.eqBlotterViewSubject.next(view);
  }

  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyle.pipe(distinctUntilChanged());
  }

  setAmbientStyle(style: AmbientStyle): void {
    void AsyncStorage.setItem(AMBIENT_STYLE_STORAGE_KEY, style).catch(() => {});
    this.ambientStyle.next(style);
  }
}
