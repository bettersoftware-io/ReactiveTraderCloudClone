import {
  asyncScheduler,
  distinctUntilChanged,
  type Observable,
  share,
  switchMap,
  throttleTime,
  timer,
} from "rxjs";

/**
 * Gates a stream behind a boolean flag: while `flag$` is true the source is
 * conflated to at most one emission per `ms` (leading + trailing — the first
 * value after a quiet period is instant, the last value of a burst is never
 * lost); while false the source passes through untouched. Flag changes take
 * effect immediately. Used by the power-saver mode to calm price-driven
 * re-renders without dropping the latest market state.
 *
 * The source is multicast internally so a flag flip does NOT resubscribe it:
 * `switchMap`'s synchronous unsubscribe-then-resubscribe on the inner
 * observable would otherwise let a single-consumer `shareReplay({refCount:
 * true})` source hit refCount zero and tear down (re-running the underlying
 * use case) on every toggle. The deferred `timer(0)` reset lets that
 * synchronous resubscribe cancel the teardown, while a genuine final
 * unsubscribe still resets the shared source (no leak).
 */
export function conflateWhen<T>(
  flag$: Observable<boolean>,
  ms: number,
): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>): Observable<T> => {
    const shared = source.pipe(share({ resetOnRefCountZero: () => timer(0) }));
    return flag$.pipe(
      distinctUntilChanged(),
      switchMap((on) => {
        return on
          ? shared.pipe(
              throttleTime(ms, asyncScheduler, {
                leading: true,
                trailing: true,
              }),
            )
          : shared;
      }),
    );
  };
}
