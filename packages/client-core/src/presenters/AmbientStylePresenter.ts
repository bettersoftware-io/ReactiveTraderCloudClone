import { type Observable, shareReplay } from "rxjs";

import type { AmbientStylePresenter as AmbientStylePresenterApi } from "@rtc/core-api";
import type { AmbientStyle, PreferencesPort } from "@rtc/domain";

/** Implements `AmbientStylePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. `style$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class AmbientStylePresenter implements AmbientStylePresenterApi {
  readonly style$: Observable<AmbientStyle>;

  constructor(private readonly preferences: PreferencesPort) {
    this.style$ = preferences
      .ambientStyle$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setStyle(style: AmbientStyle): void {
    this.preferences.setAmbientStyle(style);
  }
}
