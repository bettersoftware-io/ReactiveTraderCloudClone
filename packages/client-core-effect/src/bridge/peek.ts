import { Option } from "effect";
import { type Observable, take } from "rxjs";

/** A source's synchronous failure, boxed so that "no error" and "an error
 * whose value is `undefined`" stay distinguishable. */
interface Failure {
  error: unknown;
}

/** The current value of a replay-current Observable, read synchronously:
 * `Some` if the source emitted during `subscribe`, `None` if it did not —
 * the seed a `sharedFold` starts a warm period from. The subscription is
 * released before this returns, so nothing is left warm. A source that
 * ERRORS during `subscribe` throws that error here — a located failure at
 * the read site, not a stray global error reported out of band. */
export function peekCurrent<T>(source: Observable<T>): Option.Option<T> {
  let current: Option.Option<T> = Option.none();
  let failure: Failure | null = null;
  source
    .pipe(take(1))
    .subscribe({
      next: (value: T) => {
        current = Option.some(value);
      },
      error: (error: unknown) => {
        failure = { error };
      },
    })
    .unsubscribe();

  if (failure !== null) {
    throw (failure as Failure).error;
  }

  return current;
}

/** `peekCurrent` with a fallback for a source that does not emit on
 * subscribe — what `cycle()` advances from. Throws what `peekCurrent`
 * throws. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  return Option.getOrElse(peekCurrent(source), () => {
    return fallback;
  });
}
