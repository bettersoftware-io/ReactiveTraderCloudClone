import { type Observable, shareReplay } from "rxjs";

import type {
  LoginWaitDelay,
  LoginWaitStyle,
  PreferencesPort,
} from "@rtc/domain";

/**
 * App-layer presenter for the two login-wait inspection preferences: which
 * treatment to render (`style`) and how long to hold the outcome so it can be
 * seen (`delay`).
 *
 * One presenter for both because they are a single user-facing concern — "let
 * me watch the login animation" — and are always shown as an adjacent pair in
 * the Preferences modal's MOTION section. Splitting them would double the
 * composition wiring to no benefit.
 */
export class LoginWaitPreferencesPresenter {
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
