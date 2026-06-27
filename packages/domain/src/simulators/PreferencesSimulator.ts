import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { PreferencesPort } from "../ports/preferencesPort.js";
import {
  type BootVariant,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type ThemeMode,
  type ThemeSkin,
  type ViewMode,
} from "../preferences/preferences.js";

export interface PreferencesSeed {
  themeMode?: ThemeMode;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
  bootVariant?: BootVariant;
}

/**
 * In-memory PreferencesPort backed by BehaviorSubjects, so each stream replays
 * the current value synchronously on subscribe. For domain tests and fakes only;
 * real browser persistence uses the localStorage adapter in the client package.
 */
export class PreferencesSimulator implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeMode>;

  private readonly themeSkin: BehaviorSubject<ThemeSkin>;

  private readonly viewMode: BehaviorSubject<ViewMode>;

  private readonly animatedBg: BehaviorSubject<boolean>;

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  constructor(seed: PreferencesSeed = {}) {
    this.themeMode = new BehaviorSubject<ThemeMode>(
      seed.themeMode ?? DEFAULT_THEME_MODE,
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
  }

  themeMode$(): Observable<ThemeMode> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeMode): void {
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
}
