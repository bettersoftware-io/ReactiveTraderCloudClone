import { type Observable, take } from "rxjs";

/** A source that errors on subscribe captures its error here rather than as
 * an inline object type literal (`rtc/no-restricted-syntax` bans one in a
 * type-argument/return position). */
interface Failure {
  error: unknown;
}

/** The current value of a replay-current Observable, read through a fresh
 * subscription that is released before this returns; `fallback` if it did
 * not emit on subscribe. A source that errors on subscribe throws here — a
 * located failure at the read site (the alternative cores' `peek`). */
export function readNow<T>(source: Observable<T>, fallback: T): T {
  let value = fallback;
  let failure: Failure | null = null;
  source
    .pipe(take(1))
    .subscribe({
      next: (current: T) => {
        value = current;
      },
      error: (error: unknown) => {
        failure = { error };
      },
    })
    .unsubscribe();

  if (failure !== null) {
    throw (failure as Failure).error;
  }

  return value;
}
