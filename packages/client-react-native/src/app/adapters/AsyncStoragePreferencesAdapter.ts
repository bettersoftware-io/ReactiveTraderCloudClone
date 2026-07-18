import AsyncStorage from "@react-native-async-storage/async-storage";
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  type BootVariant,
  type CreditRfqFilter,
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
  return value === "core" || value === "laser" || value === "docking";
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

/**
 * AsyncStorage-backed PreferencesPort for the RN client. AsyncStorage has no
 * synchronous read, so each BehaviorSubject seeds with its DEFAULT
 * synchronously on construction (still satisfying the port's no-flash,
 * replay-current contract), then `hydrate()` reads the store asynchronously
 * and `.next()`s any valid stored value it finds. `set*` writes through to
 * AsyncStorage (fire-and-forget) and pushes the new value synchronously.
 * Mirrors `LocalStoragePreferencesAdapter`'s keys, guards, and defaults so
 * the two adapters stay behaviourally interchangeable.
 */
export class AsyncStoragePreferencesAdapter implements PreferencesPort {
  private readonly themeMode = new BehaviorSubject<ThemeModePreference>(
    DEFAULT_THEME_MODE_PREFERENCE,
  );

  private readonly themeSkin = new BehaviorSubject<ThemeSkin>(
    DEFAULT_THEME_SKIN,
  );

  private readonly viewMode = new BehaviorSubject<ViewMode>(DEFAULT_VIEW_MODE);

  // Intentionally off by default on mobile, overriding the web-oriented
  // DEFAULT_ANIMATED_BACKGROUND (true): the native RN backdrop is not the
  // compositor-only CSS the web ships, and an always-animating layer is a
  // battery cost on device. A user's explicit choice still persists.
  private readonly animatedBg = new BehaviorSubject<boolean>(false);

  private readonly powerSaverSubject = new BehaviorSubject<PowerSaverLevel>(
    DEFAULT_POWER_SAVER_LEVEL,
  );

  private readonly forceBootAnimationSubject = new BehaviorSubject<boolean>(
    DEFAULT_FORCE_BOOT_ANIMATION,
  );

  private readonly bootVariantSubject = new BehaviorSubject<BootVariant>(
    DEFAULT_BOOT_VARIANT,
  );

  private readonly creditRfqFilterSubject =
    new BehaviorSubject<CreditRfqFilter>(DEFAULT_CREDIT_RFQ_FILTER);

  private readonly eqWatchlistSortSubject =
    new BehaviorSubject<EqWatchlistSort>(DEFAULT_EQ_WATCHLIST_SORT);

  private readonly eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
    DEFAULT_EQ_BLOTTER_VIEW,
  );

  constructor() {
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
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
      ]);

      if (isThemeModePreference(themeMode)) {
        this.themeMode.next(themeMode);
      }

      if (isThemeSkin(themeSkin)) {
        this.themeSkin.next(themeSkin);
      }

      if (isViewMode(viewMode)) {
        this.viewMode.next(viewMode);
      }

      if (animatedBg === "true") {
        this.animatedBg.next(true);
      } else if (animatedBg === "false") {
        this.animatedBg.next(false);
      }

      if (isPowerSaverLevel(powerSaver)) {
        this.powerSaverSubject.next(powerSaver);
      } else if (powerSaver === "true") {
        this.powerSaverSubject.next("calm");
      }

      if (forceBootAnimation === "true") {
        this.forceBootAnimationSubject.next(true);
      } else if (forceBootAnimation === "false") {
        this.forceBootAnimationSubject.next(false);
      }

      if (isBootVariant(bootVariant)) {
        this.bootVariantSubject.next(bootVariant);
      }

      if (isCreditRfqFilter(creditRfqFilter)) {
        this.creditRfqFilterSubject.next(creditRfqFilter);
      }

      if (isEqWatchlistSort(eqWatchlistSort)) {
        this.eqWatchlistSortSubject.next(eqWatchlistSort);
      }

      if (isEqBlotterView(eqBlotterView)) {
        this.eqBlotterViewSubject.next(eqBlotterView);
      }
    } catch {
      // AsyncStorage may be unavailable — keep the seeded defaults.
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
}
