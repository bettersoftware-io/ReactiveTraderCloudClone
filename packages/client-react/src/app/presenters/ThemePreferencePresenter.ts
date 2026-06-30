import {
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  shareReplay,
  take,
} from "rxjs";

import {
  DEFAULT_THEME_MODE_PREFERENCE,
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
   * (dark → light → system → dark). Reads the CURRENT persisted preference
   * synchronously (themeMode$ is replay-current) rather than from a caller's
   * captured value, so rapid successive clicks each advance from the true state
   * instead of a stale render closure. */
  cycle(): void {
    let current: ThemeModePreference = DEFAULT_THEME_MODE_PREFERENCE;
    this.preferences
      .themeMode$()
      .pipe(take(1))
      .subscribe((p) => {
        current = p;
      });
    this.setMode(nextThemeModePreference(current));
  }
}
