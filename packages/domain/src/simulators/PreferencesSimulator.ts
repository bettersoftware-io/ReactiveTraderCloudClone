import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { PreferencesPort } from "../ports/preferencesPort.js";
import {
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "../preferences/preferences.js";

export interface PreferencesSeed {
  themeMode?: ThemeModePreference;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
  bootVariant?: BootVariant;
  creditRfqFilter?: CreditRfqFilter;
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

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;

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
      seed.animatedBackground ?? false,
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      seed.bootVariant ?? DEFAULT_BOOT_VARIANT,
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      seed.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER,
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
}
