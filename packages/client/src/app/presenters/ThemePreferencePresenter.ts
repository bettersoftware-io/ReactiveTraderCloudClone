import { type Observable, shareReplay } from "rxjs";
import type { PreferencesPort, Theme } from "@rtc/domain";

/**
 * App-layer presenter for the theme preference. Exposes the replay-current
 * theme stream and the write/toggle operations, keeping persistence out of the
 * UI. shareReplay multicasts the current value to every subscriber.
 */
export class ThemePreferencePresenter {
  readonly theme$: Observable<Theme>;

  constructor(private readonly preferences: PreferencesPort) {
    this.theme$ = preferences.theme$().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  setTheme(theme: Theme): void {
    this.preferences.setTheme(theme);
  }

  /** Flip light↔dark relative to the supplied current value. */
  toggle(current: Theme): void {
    this.setTheme(current === "dark" ? "light" : "dark");
  }
}
