import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  BOOT_VARIANTS,
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  EQ_WATCHLIST_SORTS,
  type EqBlotterView,
  type EqWatchlistSort,
  type PreferencesPort,
  THEME_SKINS,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

export const THEME_STORAGE_KEY = "rtc-theme"; // legacy key → mode (back-compat)
export const THEME_SKIN_STORAGE_KEY = "rtc-theme-skin";
export const VIEW_MODE_STORAGE_KEY = "rtc-view-mode";
export const ANIMATED_BG_STORAGE_KEY = "rtc-animated-bg";
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

function readStored<T extends string>(
  key: string,
  guard: (value: string | null) => value is T,
  fallback: T,
): T {
  try {
    const stored = localStorage.getItem(key);

    if (guard(stored)) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (private mode, disabled cookies, etc.)
  }

  return fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);

    if (stored === "true") {
      return true;
    }

    if (stored === "false") {
      return false;
    }
  } catch {
    // ignore — best-effort read
  }

  return fallback;
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — persistence is best-effort
  }
}

/**
 * localStorage-backed PreferencesPort. Seeds BehaviorSubjects from a synchronous
 * read on construction (validated against the closed unions, falling back to the
 * default on invalid/missing/throwing storage), so subscribers get the current
 * value synchronously — no theme flash. The legacy `"rtc-theme"` key continues to
 * carry the MODE so existing users' stored preference survives the skin×mode
 * split; skin and animated-background live under their own keys. This is the only
 * localStorage site in the client.
 */
export class LocalStoragePreferencesAdapter implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeModePreference>;

  private readonly themeSkin: BehaviorSubject<ThemeSkin>;

  private readonly viewMode: BehaviorSubject<ViewMode>;

  private readonly animatedBg: BehaviorSubject<boolean>;

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;

  private readonly eqWatchlistSortSubject: BehaviorSubject<EqWatchlistSort>;

  private readonly eqBlotterViewSubject: BehaviorSubject<EqBlotterView>;

  constructor() {
    this.themeMode = new BehaviorSubject<ThemeModePreference>(
      readStored(
        THEME_STORAGE_KEY,
        isThemeModePreference,
        DEFAULT_THEME_MODE_PREFERENCE,
      ),
    );
    this.themeSkin = new BehaviorSubject<ThemeSkin>(
      readStored(THEME_SKIN_STORAGE_KEY, isThemeSkin, DEFAULT_THEME_SKIN),
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      readStored(VIEW_MODE_STORAGE_KEY, isViewMode, DEFAULT_VIEW_MODE),
    );
    this.animatedBg = new BehaviorSubject<boolean>(
      readBool(ANIMATED_BG_STORAGE_KEY, false),
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      readStored(BOOT_VARIANT_STORAGE_KEY, isBootVariant, DEFAULT_BOOT_VARIANT),
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      readStored(
        CREDIT_RFQ_FILTER_STORAGE_KEY,
        isCreditRfqFilter,
        DEFAULT_CREDIT_RFQ_FILTER,
      ),
    );
    this.eqWatchlistSortSubject = new BehaviorSubject<EqWatchlistSort>(
      readStored(
        EQ_WATCHLIST_SORT_STORAGE_KEY,
        isEqWatchlistSort,
        DEFAULT_EQ_WATCHLIST_SORT,
      ),
    );
    this.eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
      readStored(
        EQ_BLOTTER_VIEW_STORAGE_KEY,
        isEqBlotterView,
        DEFAULT_EQ_BLOTTER_VIEW,
      ),
    );
  }

  themeMode$(): Observable<ThemeModePreference> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeModePreference): void {
    writeStored(THEME_STORAGE_KEY, mode);
    this.themeMode.next(mode);
  }

  themeSkin$(): Observable<ThemeSkin> {
    return this.themeSkin.pipe(distinctUntilChanged());
  }

  setThemeSkin(skin: ThemeSkin): void {
    writeStored(THEME_SKIN_STORAGE_KEY, skin);
    this.themeSkin.next(skin);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    writeStored(VIEW_MODE_STORAGE_KEY, viewMode);
    this.viewMode.next(viewMode);
  }

  animatedBackground$(): Observable<boolean> {
    return this.animatedBg.pipe(distinctUntilChanged());
  }

  setAnimatedBackground(on: boolean): void {
    writeStored(ANIMATED_BG_STORAGE_KEY, on ? "true" : "false");
    this.animatedBg.next(on);
  }

  bootVariant$(): Observable<BootVariant> {
    return this.bootVariantSubject.pipe(distinctUntilChanged());
  }

  setBootVariant(variant: BootVariant): void {
    writeStored(BOOT_VARIANT_STORAGE_KEY, variant);
    this.bootVariantSubject.next(variant);
  }

  creditRfqFilter$(): Observable<CreditRfqFilter> {
    return this.creditRfqFilterSubject.pipe(distinctUntilChanged());
  }

  setCreditRfqFilter(filter: CreditRfqFilter): void {
    writeStored(CREDIT_RFQ_FILTER_STORAGE_KEY, filter);
    this.creditRfqFilterSubject.next(filter);
  }

  eqWatchlistSort$(): Observable<EqWatchlistSort> {
    return this.eqWatchlistSortSubject.pipe(distinctUntilChanged());
  }

  setEqWatchlistSort(sort: EqWatchlistSort): void {
    writeStored(EQ_WATCHLIST_SORT_STORAGE_KEY, sort);
    this.eqWatchlistSortSubject.next(sort);
  }

  eqBlotterView$(): Observable<EqBlotterView> {
    return this.eqBlotterViewSubject.pipe(distinctUntilChanged());
  }

  setEqBlotterView(view: EqBlotterView): void {
    writeStored(EQ_BLOTTER_VIEW_STORAGE_KEY, view);
    this.eqBlotterViewSubject.next(view);
  }
}
