import {
  asyncScheduler,
  distinctUntilChanged,
  type Observable,
  switchMap,
  throttleTime,
} from "rxjs";

/**
 * Gates a stream behind a boolean flag: while `flag$` is true the source is
 * conflated to at most one emission per `ms` (leading + trailing — the first
 * value after a quiet period is instant, the last value of a burst is never
 * lost); while false the source passes through untouched. Flag changes take
 * effect immediately. Used by the power-saver mode to calm price-driven
 * re-renders without dropping the latest market state.
 */
export function conflateWhen<T>(
  flag$: Observable<boolean>,
  ms: number,
): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>): Observable<T> => {
    return flag$.pipe(
      distinctUntilChanged(),
      switchMap((on) => {
        return on
          ? source.pipe(
              throttleTime(ms, asyncScheduler, {
                leading: true,
                trailing: true,
              }),
            )
          : source;
      }),
    );
  };
}
