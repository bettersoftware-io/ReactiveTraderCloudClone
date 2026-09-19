import { type StateObservable, state } from "@rx-state/core";
import { concat, merge, type Observable, of, Subject, timer } from "rxjs";
import {
  catchError,
  debounceTime,
  map,
  scan,
  startWith,
  switchMap,
} from "rxjs/operators";

import type {
  ThroughputMessage,
  ThroughputPresenter as ThroughputPresenterApi,
  ThroughputView,
} from "@rtc/core-api";
import type { AdminPort } from "@rtc/domain";

/** UI cadence constants relocated out of the old useThroughput React hook.
 *  These are presentation timings (debounce the write, auto-dismiss the
 *  confirmation), not domain rules, so they live here in the presenter. */
export const DEBOUNCE_MS = 300;
export const MESSAGE_DISMISS_MS = 3_000;

/** Default value shown when the initial load fails (mirrors the old hook's
 *  useState(100) seed, which it kept on a failed fetch). */
const DEFAULT_VALUE = 100;

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 4) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { ThroughputView };

const INITIAL: ThroughputView = {
  value: DEFAULT_VALUE,
  loading: true,
  message: null,
};

/** A partial view patch folded into the running view by `scan`. */
type Patch = Partial<ThroughputView>;

/** Implements `ThroughputPresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Relocated out of the old `useThroughput` React hook;
 * global/shared state, so the seam binds `state$` with react-rxjs `bind`
 * (not a per-mount machine). `setValue` debounces the write by
 * `DEBOUNCE_MS` and auto-dismisses the resulting banner after
 * `MESSAGE_DISMISS_MS`. */
export class ThroughputPresenter implements ThroughputPresenterApi {
  readonly state$: StateObservable<ThroughputView>;

  private readonly setValue$ = new Subject<number>();

  constructor(admin: AdminPort) {
    // Initial load: loading until getThroughput resolves; default on error.
    const load$: Observable<Patch> = admin.getThroughput().pipe(
      map((value): Patch => {
        return { value, loading: false };
      }),
      startWith({ loading: true } as Patch),
      catchError(() => {
        return of<Patch>({ value: DEFAULT_VALUE, loading: false });
      }),
    );

    // Optimistic echo: reflect every requested value immediately, before the
    // debounced write fires (mirrors the old hook's setLocalValue on input).
    const optimistic$: Observable<Patch> = this.setValue$.pipe(
      map((value): Patch => {
        return { value };
      }),
    );

    // Debounced write: coalesce rapid edits, persist the last one, then show a
    // banner that auto-dismisses. switchMap drops an in-flight write/dismiss
    // when a newer debounced value arrives.
    const write$: Observable<Patch> = this.setValue$.pipe(
      debounceTime(DEBOUNCE_MS),
      switchMap((value) => {
        return admin.setThroughput(value).pipe(
          map((): ThroughputMessage => {
            return {
              text: `Throughput has been set to ${value}`,
              isError: false,
            };
          }),
          catchError(() => {
            return of<ThroughputMessage>({
              text: "Error setting throughput",
              isError: true,
            });
          }),
          switchMap((message) =>
            // Show the banner, then dismiss it after MESSAGE_DISMISS_MS.
            {
              return concat(
                of<Patch>({ message }),
                timer(MESSAGE_DISMISS_MS).pipe(
                  map((): Patch => {
                    return { message: null };
                  }),
                ),
              );
            },
          ),
        );
      }),
    );

    const stream$ = merge(load$, optimistic$, write$).pipe(
      scan((view, patch) => {
        return { ...view, ...patch };
      }, INITIAL),
    );

    this.state$ = state(stream$, INITIAL);
  }

  /** Optimistically set the value and schedule a debounced persist. */
  setValue(value: number): void {
    this.setValue$.next(value);
  }
}
