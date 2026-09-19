import { type Observable, shareReplay } from "rxjs";

import type { ForceBootAnimationPresenter as ForceBootAnimationPresenterApi } from "@rtc/core-api";
import type { PreferencesPort } from "@rtc/domain";

/** Implements `ForceBootAnimationPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. `enabled$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class ForceBootAnimationPresenter
  implements ForceBootAnimationPresenterApi
{
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .forceBootAnimation$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setForceBootAnimation(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
