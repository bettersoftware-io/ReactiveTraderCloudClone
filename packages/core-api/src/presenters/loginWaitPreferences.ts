import type { LoginWaitDelay, LoginWaitStyle } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The two login-wait inspection preferences: which treatment to render
 * (`style`) and how long to hold the outcome so it can be seen (`delay`).
 *
 * One presenter for both because they are a single user-facing concern — "let
 * me watch the login animation" — and are always shown as an adjacent pair in
 * the Preferences modal's MOTION section.
 */
export interface LoginWaitPreferencesPresenter {
  readonly style$: Stream<LoginWaitStyle>;
  readonly delay$: Stream<LoginWaitDelay>;
  setStyle(style: LoginWaitStyle): void;
  setDelay(delay: LoginWaitDelay): void;
}
