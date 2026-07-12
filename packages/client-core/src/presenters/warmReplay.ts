import { type MonoTypeOperatorFunction, shareReplay } from "rxjs";

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
 */
export function warmReplay<T>(): MonoTypeOperatorFunction<T> {
  return shareReplay<T>({ bufferSize: 1, refCount: false });
}
