import { type Observable, shareReplay } from "rxjs";

import type { ThemeSkinPreferencePresenter as ThemeSkinPreferencePresenterApi } from "@rtc/core-api";
import type { PreferencesPort, ThemeSkin } from "@rtc/domain";

/** Implements `ThemeSkinPreferencePresenter` (`@rtc/core-api`) — see the
 * interface for the contract. `skin$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class ThemeSkinPreferencePresenter
  implements ThemeSkinPreferencePresenterApi
{
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
