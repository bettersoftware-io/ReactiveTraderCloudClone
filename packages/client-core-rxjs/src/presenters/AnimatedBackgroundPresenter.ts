import { type Observable, shareReplay } from "rxjs";

import type { AnimatedBackgroundPresenter as AnimatedBackgroundPresenterApi } from "@rtc/core-api";
import type { PreferencesPort } from "@rtc/domain";

/** Implements `AnimatedBackgroundPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. `enabled$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class AnimatedBackgroundPresenter
  implements AnimatedBackgroundPresenterApi
{
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .animatedBackground$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setAnimatedBackground(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
