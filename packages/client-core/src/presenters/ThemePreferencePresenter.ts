import {
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  shareReplay,
} from "rxjs";

import type { ThemePreferencePresenter as ThemePreferencePresenterApi } from "@rtc/core-api";
import {
  DEFAULT_THEME_MODE_PREFERENCE,
  nextThemeModePreference,
  type PreferencesPort,
  resolveThemeMode,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import type { ColorSchemeSource } from "../theme/colorSchemeSource";
import { readNow } from "./readNow";

/**
 * App-layer presenter for the theme-mode preference. Exposes two streams:
 * `modePreference$` (the stored CHOICE dark | light | system — drives the
 * header toggle's icon) and `mode$` (the RESOLVED mode that paints, with
 * "system" collapsed against the OS via the ColorSchemeSource). Keeps
 * persistence and the media-query out of the UI.
 */
export class ThemePreferencePresenter implements ThemePreferencePresenterApi {
  /** The stored mode choice; "system" is left un-resolved here. */
  readonly modePreference$: Observable<ThemeModePreference>;

  /** The concrete mode to paint — "system" resolved against the OS scheme. */
  readonly mode$: Observable<ThemeMode>;

  /** The port's stream, captured once at construction — `cycle()` reads
   * through a fresh subscription of THIS Observable rather than a fresh call
   * of `preferences.themeMode$()`, so the port method is called once
   * regardless of how many times cycle() runs. */
  private readonly themeMode$: Observable<ThemeModePreference>;

  constructor(
    private readonly preferences: PreferencesPort,
    colorScheme: ColorSchemeSource,
  ) {
    this.themeMode$ = preferences.themeMode$();
    this.modePreference$ = this.themeMode$.pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );

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
    this.setMode(
      nextThemeModePreference(
        readNow(this.themeMode$, DEFAULT_THEME_MODE_PREFERENCE),
      ),
    );
  }
}
