import { type Observable, shareReplay } from "rxjs";

import type { ViewModePreferencePresenter as ViewModePreferencePresenterApi } from "@rtc/core-api";
import type { PreferencesPort, ViewMode } from "@rtc/domain";

/** Implements `ViewModePreferencePresenter` (`@rtc/core-api`) — see the
 * interface for the contract. `viewMode$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class ViewModePreferencePresenter
  implements ViewModePreferencePresenterApi
{
  readonly viewMode$: Observable<ViewMode>;

  constructor(private readonly preferences: PreferencesPort) {
    this.viewMode$ = preferences
      .viewMode$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setViewMode(viewMode: ViewMode): void {
    this.preferences.setViewMode(viewMode);
  }
}
