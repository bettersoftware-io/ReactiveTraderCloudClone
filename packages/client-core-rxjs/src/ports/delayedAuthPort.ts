import { type Observable, of, timer } from "rxjs";
import { map, mergeMap } from "rxjs/operators";

import type { AccountFlowOutcome, AuthOutcome, AuthPort } from "@rtc/domain";

/**
 * Wraps an `AuthPort` so its outcome is held back by an artificial delay,
 * making the login-wait treatments observable against a backend that answers
 * faster than they can render.
 *
 * A decorator rather than a branch inside `AuthPresenter`, for three reasons:
 * the presenter stays ignorant of a purely presentational concern; unlock is
 * covered for free, since it goes through the same `login()`; and it is
 * independent of which port it wraps, so the delay behaves identically in
 * simulator and WS-real mode.
 *
 * The five account flows pass through undelayed: the delay is a login-wait
 * treatment, and a flow's answer renders as a form state, not a wait screen.
 *
 * Two deliberate details:
 *
 * - `delayMs` is a supplier read PER OUTCOME rather than a captured number, so
 *   changing the preference takes effect on the very next attempt without
 *   recomposing the app.
 * - Zero passes the outcome through SYNCHRONOUSLY via `of`, instead of going
 *   through `timer(0)`. `timer(0)` would still defer by a macrotask, which
 *   would make every login asynchronous for users who never touched this
 *   setting — a real behaviour change dressed up as a no-op.
 */
export function withLoginDelay(
  inner: AuthPort,
  delayMs: () => number,
): AuthPort {
  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      return inner.login(username, password).pipe(
        mergeMap((outcome) => {
          const ms = delayMs();

          if (ms <= 0) {
            return of(outcome);
          }

          return timer(ms).pipe(
            map(() => {
              return outcome;
            }),
          );
        }),
      );
    },
    register(
      email: string,
      displayName: string,
    ): Observable<AccountFlowOutcome> {
      return inner.register(email, displayName);
    },
    resendCode(email: string): Observable<AccountFlowOutcome> {
      return inner.resendCode(email);
    },
    confirmEmail(
      email: string,
      code: string,
      password: string,
    ): Observable<AccountFlowOutcome> {
      return inner.confirmEmail(email, code, password);
    },
    requestPasswordReset(email: string): Observable<AccountFlowOutcome> {
      return inner.requestPasswordReset(email);
    },
    resetPassword(
      email: string,
      code: string,
      password: string,
    ): Observable<AccountFlowOutcome> {
      return inner.resetPassword(email, code, password);
    },
  };
}
