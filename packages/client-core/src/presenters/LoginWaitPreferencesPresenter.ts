import { type Observable, shareReplay } from "rxjs";

import type { LoginWaitPreferencesPresenter as LoginWaitPreferencesPresenterApi } from "@rtc/core-api";
import type {
  LoginWaitDelay,
  LoginWaitStyle,
  PreferencesPort,
} from "@rtc/domain";

/** Implements `LoginWaitPreferencesPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. Both streams are separate port reads, each
 * under `shareReplay({ bufferSize: 1, refCount: true })`. */
export class LoginWaitPreferencesPresenter
  implements LoginWaitPreferencesPresenterApi
{
  readonly style$: Observable<LoginWaitStyle>;

  readonly delay$: Observable<LoginWaitDelay>;

  constructor(private readonly preferences: PreferencesPort) {
    this.style$ = preferences
      .loginWaitStyle$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.delay$ = preferences
      .loginWaitDelay$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setStyle(style: LoginWaitStyle): void {
    this.preferences.setLoginWaitStyle(style);
  }

  setDelay(delay: LoginWaitDelay): void {
    this.preferences.setLoginWaitDelay(delay);
  }
}
