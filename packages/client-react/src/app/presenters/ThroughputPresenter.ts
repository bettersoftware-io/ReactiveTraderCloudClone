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

import type { AdminPort } from "@rtc/domain";

/** UI cadence constants relocated out of the old useThroughput React hook.
 *  These are presentation timings (debounce the write, auto-dismiss the
 *  confirmation), not domain rules, so they live here in the presenter. */
export const DEBOUNCE_MS = 300;
export const MESSAGE_DISMISS_MS = 3_000;

/** Default value shown when the initial load fails (mirrors the old hook's
 *  useState(100) seed, which it kept on a failed fetch). */
const DEFAULT_VALUE = 100;

/** The status banner the AdminPanel renders. Shape matches the old hook. */
export interface ThroughputMessage {
  text: string;
  isError: boolean;
}

/** The view the AdminPanel reads: the slider/input value, the initial-load
 *  flag, and the optional confirmation/error banner. */
export interface ThroughputView {
  value: number;
  loading: boolean;
  message: ThroughputMessage | null;
}

const INITIAL: ThroughputView = {
  value: DEFAULT_VALUE,
  loading: true,
  message: null,
};

/** A partial view patch folded into the running view by `scan`. */
type Patch = Partial<ThroughputView>;

/**
 * Throughput control state, relocated out of the old useThroughput React hook.
 *
 * Global/shared state (a single server-side throughput), so the seam binds this
 * presenter's `state$` with react-rxjs `bind` (not a per-mount machine).
 *
 * Behaviour reproduced from the old hook:
 *  - initial load: getThroughput(), starting in loading:true, falling back to
 *    the default value (not-loading) on error;
 *  - setValue: optimistically reflect the value immediately, then debounce the
 *    write by DEBOUNCE_MS; on success show a confirmation banner that
 *    auto-dismisses after MESSAGE_DISMISS_MS; on failure show an error banner
 *    (also auto-dismissing).
 */
export class ThroughputPresenter {
  readonly state$: StateObservable<ThroughputView>;

  private readonly setValue$ = new Subject<number>();

  constructor(admin: AdminPort) {
    // Initial load: loading until getThroughput resolves; default on error.
    const load$: Observable<Patch> = admin.getThroughput().pipe(
      map((value): Patch => ({ value, loading: false })),
      startWith({ loading: true } as Patch),
      catchError(() => of<Patch>({ value: DEFAULT_VALUE, loading: false })),
    );

    // Optimistic echo: reflect every requested value immediately, before the
    // debounced write fires (mirrors the old hook's setLocalValue on input).
    const optimistic$: Observable<Patch> = this.setValue$.pipe(
      map((value): Patch => ({ value })),
    );

    // Debounced write: coalesce rapid edits, persist the last one, then show a
    // banner that auto-dismisses. switchMap drops an in-flight write/dismiss
    // when a newer debounced value arrives.
    const write$: Observable<Patch> = this.setValue$.pipe(
      debounceTime(DEBOUNCE_MS),
      switchMap((value) =>
        admin.setThroughput(value).pipe(
          map(
            (): ThroughputMessage => ({
              text: `Throughput has been set to ${value}`,
              isError: false,
            }),
          ),
          catchError(() =>
            of<ThroughputMessage>({
              text: "Error setting throughput",
              isError: true,
            }),
          ),
          switchMap((message) =>
            // Show the banner, then dismiss it after MESSAGE_DISMISS_MS.
            concat(
              of<Patch>({ message }),
              timer(MESSAGE_DISMISS_MS).pipe(
                map((): Patch => ({ message: null })),
              ),
            ),
          ),
        ),
      ),
    );

    const stream$ = merge(load$, optimistic$, write$).pipe(
      scan((view, patch) => ({ ...view, ...patch }), INITIAL),
    );

    this.state$ = state(stream$, INITIAL);
  }

  /** Optimistically set the value and schedule a debounced persist. */
  setValue(value: number): void {
    this.setValue$.next(value);
  }
}
