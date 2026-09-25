import { type Observable, shareReplay } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { EventLogPresenter as EventLogPresenterApi } from "@rtc/core-api";
import { prependLogEvent } from "@rtc/core-logic";
import {
  MAX_LOG_ROWS as DOMAIN_MAX_LOG_ROWS,
  type EventLogPort,
  type LogEvent,
} from "@rtc/domain";

/** Maximum number of log rows retained in the rolling window (newest-first).
 * Kept for existing importers: re-exports the domain constant. */
export const MAX_LOG_ROWS: number = DOMAIN_MAX_LOG_ROWS;

/** Implements `EventLogPresenter` (`@rtc/core-api`) — see the interface for
 * the contract. Accumulates `EventLogPort.events$()` via `scan`.
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
export class EventLogPresenter implements EventLogPresenterApi {
  readonly events$: Observable<readonly LogEvent[]>;

  constructor(port: EventLogPort) {
    this.events$ = port
      .events$()
      .pipe(
        scan(prependLogEvent, [] as readonly LogEvent[]),
        startWith([] as readonly LogEvent[]),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
  }
}
