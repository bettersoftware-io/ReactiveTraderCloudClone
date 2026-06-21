import type { PreferencesPort, ViewMode } from "@rtc/domain";
import { type Observable, shareReplay } from "rxjs";

/**
 * App-layer presenter for the live-rates view-mode preference. Exposes the
 * replay-current view-mode stream and the write operation, keeping persistence
 * out of the UI.
 */
export class ViewModePreferencePresenter {
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
