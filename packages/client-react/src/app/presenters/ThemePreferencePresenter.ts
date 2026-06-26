import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort, ThemeMode } from "@rtc/domain";

/**
 * App-layer presenter for the theme-mode preference. Exposes the replay-current
 * mode stream and the write/toggle operations, keeping persistence out of the UI.
 */
export class ThemePreferencePresenter {
  readonly mode$: Observable<ThemeMode>;

  constructor(private readonly preferences: PreferencesPort) {
    this.mode$ = preferences
      .themeMode$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setMode(mode: ThemeMode): void {
    this.preferences.setThemeMode(mode);
  }

  /** Flip light↔dark relative to the supplied current value. */
  toggle(current: ThemeMode): void {
    this.setMode(current === "dark" ? "light" : "dark");
  }
}
