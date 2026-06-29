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
 * Mirrored shape: one stream, shared/ref-counted via shareReplay(1).
 */
export class EventLogPresenter {
  readonly events$: Observable<readonly LogEvent[]>;

  constructor(port: EventLogPort) {
    this.events$ = port.events$().pipe(
      scan(
        (acc, e) => [e, ...acc].slice(0, MAX_LOG_ROWS) as readonly LogEvent[],
        [] as readonly LogEvent[],
      ),
      startWith([] as readonly LogEvent[]),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
