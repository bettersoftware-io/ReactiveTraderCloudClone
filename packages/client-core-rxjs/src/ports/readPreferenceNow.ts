import { type Observable, take } from "rxjs";

/** Read a replay-current preference stream synchronously, or `fallback`.
 *
 * Every PreferencesPort adapter is BehaviorSubject-backed, so the value lands
 * before `.subscribe()` returns. The `fallback` guards a hypothetical
 * non-replaying implementation: without it the caller would see `undefined`,
 * and for the login-wait cycle that meant `LOGIN_WAIT_VARIANTS.indexOf(undefined)`
 * → -1 and a wait treatment that silently failed to render — precisely the
 * no-feedback state these preferences exist to fix. */
export function readPreferenceNow<T>(source$: Observable<T>, fallback: T): T {
  let value: T | undefined;
  const sub = source$.pipe(take(1)).subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();
  return value ?? fallback;
}
