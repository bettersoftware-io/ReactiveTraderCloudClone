import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort, ThemeSkin } from "@rtc/domain";

/**
 * App-layer presenter for the theme-skin preference. Exposes the replay-current
 * skin stream and the write operation, keeping persistence out of the UI.
 */
export class ThemeSkinPreferencePresenter {
  readonly skin$: Observable<ThemeSkin>;

  constructor(private readonly preferences: PreferencesPort) {
    this.skin$ = preferences
      .themeSkin$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setSkin(skin: ThemeSkin): void {
    this.preferences.setThemeSkin(skin);
  }
}
