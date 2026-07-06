import AsyncStorage from "@react-native-async-storage/async-storage";
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
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
export const BOOT_VARIANT_STORAGE_KEY = "rt-boot-variant";
export const CREDIT_RFQ_FILTER_STORAGE_KEY = "credit-rfqs-filter";

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

  private readonly animatedBg = new BehaviorSubject<boolean>(false);

  private readonly bootVariantSubject = new BehaviorSubject<BootVariant>(
    DEFAULT_BOOT_VARIANT,
  );

  private readonly creditRfqFilterSubject =
    new BehaviorSubject<CreditRfqFilter>(DEFAULT_CREDIT_RFQ_FILTER);

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
        bootVariant,
        creditRfqFilter,
      ] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(THEME_SKIN_STORAGE_KEY),
        AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY),
        AsyncStorage.getItem(ANIMATED_BG_STORAGE_KEY),
        AsyncStorage.getItem(BOOT_VARIANT_STORAGE_KEY),
        AsyncStorage.getItem(CREDIT_RFQ_FILTER_STORAGE_KEY),
      ]);

      if (isThemeModePreference(themeMode)) this.themeMode.next(themeMode);
      if (isThemeSkin(themeSkin)) this.themeSkin.next(themeSkin);
      if (isViewMode(viewMode)) this.viewMode.next(viewMode);
      if (animatedBg === "true") this.animatedBg.next(true);
      else if (animatedBg === "false") this.animatedBg.next(false);

      if (isBootVariant(bootVariant)) {
        this.bootVariantSubject.next(bootVariant);
      }

      if (isCreditRfqFilter(creditRfqFilter)) {
        this.creditRfqFilterSubject.next(creditRfqFilter);
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
}
