import {
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  shareReplay,
} from "rxjs";

import {
  nextThemeModePreference,
  type PreferencesPort,
  resolveThemeMode,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import type { ColorSchemeSource } from "../theme/colorSchemeSource";

/**
 * App-layer presenter for the theme-mode preference. Exposes two streams:
 * `modePreference$` (the stored CHOICE dark | light | system — drives the
 * header toggle's icon) and `mode$` (the RESOLVED mode that paints, with
 * "system" collapsed against the OS via the ColorSchemeSource). Keeps
 * persistence and the media-query out of the UI.
 */
export class ThemePreferencePresenter {
  /** The stored mode choice; "system" is left un-resolved here. */
  readonly modePreference$: Observable<ThemeModePreference>;

  /** The concrete mode to paint — "system" resolved against the OS scheme. */
  readonly mode$: Observable<ThemeMode>;

  constructor(
    private readonly preferences: PreferencesPort,
    colorScheme: ColorSchemeSource,
  ) {
    this.modePreference$ = preferences
      .themeMode$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    this.mode$ = combineLatest([
      this.modePreference$,
      colorScheme.prefersDark$(),
    ]).pipe(
      map(([pref, prefersDark]) => {
        return resolveThemeMode(pref, prefersDark);
      }),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  setMode(mode: ThemeModePreference): void {
    this.preferences.setThemeMode(mode);
  }

  /** Advance the stored preference one step in the toggle cycle
   * (dark → light → system → dark), relative to the supplied current value. */
  cycle(current: ThemeModePreference): void {
    this.setMode(nextThemeModePreference(current));
  }
}
