import {
  type MonoTypeOperatorFunction,
  type Observable,
  shareReplay,
  takeUntil,
} from "rxjs";

/**
 * `shareReplay` for an app-level singleton stream that must stay warm for the
 * whole session: `refCount: false` keeps the source subscribed even after the
 * last UI subscriber unmounts, and `bufferSize: 1` retains the latest value.
 *
 * Why it matters: `App.tsx` remounts the active tab's entire panel subtree on
 * every tab switch (`<WorkspaceEngine key={activeTab}>`). With the usual
 * `refCount: true`, leaving a tab drops the subscriber count to zero, tears the
 * source down, and drops the buffered state-of-the-world; returning re-subscribes
 * — which re-sends the wire `subscribe.*` and makes the server merge a *fresh*
 * stream each time (ticks/updates then accumulate). `refCount: false` holds the
 * one subscription open so a remount reads the retained value instantly and no
 * re-subscribe is sent. Mirrors the rationale on `BlotterPresenter.activity$`.
 *
 * Use ONLY for app-level singletons (one stream per connection). Per-symbol
 * streams (pricing, eqQuotes, depth) MUST release when their symbol is
 * deselected — they are refcounted on the server via `keyedStream` instead.
 *
 * "Warm for the whole session" ends at `app.dispose()`: `disposed$` — the
 * composition root's disposal signal — completes the source side, which
 * releases the one held subscription (and, through it, the port). Required,
 * not defaulted, so no singleton can be made warm without saying what ends
 * its lifetime. A REPLAYING signal is expected (the composition root's is a
 * `ReplaySubject(1)`), so a first subscriber that only arrives after dispose
 * completes at once instead of re-opening the port.
 */
export function warmReplay<T>(
  disposed$: Observable<unknown>,
): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>): Observable<T> => {
    return source.pipe(
      takeUntil(disposed$),
      shareReplay<T>({ bufferSize: 1, refCount: false }),
    );
  };
}
