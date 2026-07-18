import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { PreferencesPort } from "../ports/preferencesPort.js";
import {
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type EqBlotterView,
  type EqWatchlistSort,
  type PowerSaverLevel,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "../preferences/preferences.js";

export interface PreferencesSeed {
  themeMode?: ThemeModePreference;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
  powerSaverLevel?: PowerSaverLevel;
  bootVariant?: BootVariant;
  creditRfqFilter?: CreditRfqFilter;
  eqWatchlistSort?: EqWatchlistSort;
  eqBlotterView?: EqBlotterView;
}

/**
 * In-memory PreferencesPort backed by BehaviorSubjects, so each stream replays
 * the current value synchronously on subscribe. For domain tests and fakes only;
 * real browser persistence uses the localStorage adapter in the client package.
 */
export class PreferencesSimulator implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeModePreference>;

  private readonly themeSkin: BehaviorSubject<ThemeSkin>;

  private readonly viewMode: BehaviorSubject<ViewMode>;

  private readonly animatedBg: BehaviorSubject<boolean>;

  private readonly powerSaverSubject: BehaviorSubject<PowerSaverLevel>;

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;

  private readonly eqWatchlistSortSubject: BehaviorSubject<EqWatchlistSort>;

  private readonly eqBlotterViewSubject: BehaviorSubject<EqBlotterView>;

  constructor(seed: PreferencesSeed = {}) {
    this.themeMode = new BehaviorSubject<ThemeModePreference>(
      seed.themeMode ?? DEFAULT_THEME_MODE_PREFERENCE,
    );
    this.themeSkin = new BehaviorSubject<ThemeSkin>(
      seed.themeSkin ?? DEFAULT_THEME_SKIN,
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      seed.viewMode ?? DEFAULT_VIEW_MODE,
    );
    this.animatedBg = new BehaviorSubject<boolean>(
      seed.animatedBackground ?? DEFAULT_ANIMATED_BACKGROUND,
    );
    this.powerSaverSubject = new BehaviorSubject<PowerSaverLevel>(
      seed.powerSaverLevel ?? DEFAULT_POWER_SAVER_LEVEL,
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      seed.bootVariant ?? DEFAULT_BOOT_VARIANT,
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      seed.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER,
    );
    this.eqWatchlistSortSubject = new BehaviorSubject<EqWatchlistSort>(
      seed.eqWatchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT,
    );
    this.eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
      seed.eqBlotterView ?? DEFAULT_EQ_BLOTTER_VIEW,
    );
  }

  themeMode$(): Observable<ThemeModePreference> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeModePreference): void {
    this.themeMode.next(mode);
  }

  themeSkin$(): Observable<ThemeSkin> {
    return this.themeSkin.pipe(distinctUntilChanged());
  }

  setThemeSkin(skin: ThemeSkin): void {
    this.themeSkin.next(skin);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    this.viewMode.next(viewMode);
  }

  animatedBackground$(): Observable<boolean> {
    return this.animatedBg.pipe(distinctUntilChanged());
  }

  setAnimatedBackground(on: boolean): void {
    this.animatedBg.next(on);
  }

  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    this.powerSaverSubject.next(level);
  }

  bootVariant$(): Observable<BootVariant> {
    return this.bootVariantSubject.pipe(distinctUntilChanged());
  }

  setBootVariant(variant: BootVariant): void {
    this.bootVariantSubject.next(variant);
  }

  creditRfqFilter$(): Observable<CreditRfqFilter> {
    return this.creditRfqFilterSubject.pipe(distinctUntilChanged());
  }

  setCreditRfqFilter(filter: CreditRfqFilter): void {
    this.creditRfqFilterSubject.next(filter);
  }

  eqWatchlistSort$(): Observable<EqWatchlistSort> {
    return this.eqWatchlistSortSubject.pipe(distinctUntilChanged());
  }

  setEqWatchlistSort(sort: EqWatchlistSort): void {
    this.eqWatchlistSortSubject.next(sort);
  }

  eqBlotterView$(): Observable<EqBlotterView> {
    return this.eqBlotterViewSubject.pipe(distinctUntilChanged());
  }

  setEqBlotterView(view: EqBlotterView): void {
    this.eqBlotterViewSubject.next(view);
  }
}
