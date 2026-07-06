import { type Observable, shareReplay } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { EventLogPort, LogEvent } from "@rtc/domain";

/** Maximum number of log rows retained in the rolling window (newest-first). */
export const MAX_LOG_ROWS = 200;

/**
 * Accumulates `LogEvent` emissions from the EventLogPort into a newest-first
 * rolling list capped at MAX_LOG_ROWS.  Starts with an empty array before any
 * events arrive so dumb-UI components render immediately without suspending.
 *
 * Mirrored shape: one stream, shared/ref-counted via shareReplay(1) — except
 * `refCount` is `false`, not the usual `true` (see BlotterPresenter.activity$
 * for the fuller writeup of this pattern). `LiveEventLog` (Admin tab) is
 * this stream's only consumer, and `App.tsx` remounts a tab's whole subtree
 * on switch (`<WorkspaceEngine key={activeTab}>`), which unsubscribes it.
 * With `refCount: true` that would tear down the `scan` accumulator on every
 * tab-away and silently drop the rolling log on tab-back — the same class
 * of bug as the Activity feed. `refCount: false` keeps the accumulator (and
 * its one subscription into the underlying port) alive for this
 * presenter's lifetime instead, which is safe because `EventLogPresenter`
 * is a composition-root singleton (packages/client-core/src/composition.ts),
 * not a per-mount instance.
 */
export class EventLogPresenter {
  readonly events$: Observable<readonly LogEvent[]>;

  constructor(port: EventLogPort) {
    this.events$ = port.events$().pipe(
      scan(
        (acc, e) => {
          return [e, ...acc].slice(0, MAX_LOG_ROWS) as readonly LogEvent[];
        },
        [] as readonly LogEvent[],
      ),
      startWith([] as readonly LogEvent[]),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
