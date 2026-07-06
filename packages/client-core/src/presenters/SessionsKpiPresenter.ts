import { type Observable, shareReplay } from "rxjs";
import { map, scan, startWith } from "rxjs/operators";

import type { MetricSample, SessionsPort } from "@rtc/domain";

import { WINDOW } from "./windowedSamples";

/**
 * Session-count KPI series for the Admin observability board's "Active
 * Sessions" card. Maps each `SessionsPort.sessions$()` emission to a
 * `MetricSample` (session count, timestamped like `BlotterPresenter`'s
 * fill-clock read) and accumulates a rolling `WINDOW`-sized series — the
 * same shape `windowedSamples` gives the other three KPI streams.
 *
 * Diverges from `windowedSamples` in one respect: `refCount: false`, not
 * `true`. This mirrors `EventLogPresenter`'s remount-survival fix (see its
 * doc comment for the fuller writeup) — the KPI row is the sole consumer,
 * and `App.tsx` remounts a tab's whole subtree on switch
 * (`<WorkspaceEngine key={activeTab}>`), which unsubscribes it. With
 * `refCount: true` the `scan` accumulator would tear down on every
 * tab-away and the sparkline would lose its history on tab-back.
 * `refCount: false` keeps the accumulator (and its one subscription into
 * `SessionsPort`) alive for this presenter's lifetime instead, which is
 * safe because `SessionsKpiPresenter` is a composition-root singleton
 * (packages/client-core/src/composition.ts), not a per-mount instance.
 */
export class SessionsKpiPresenter {
  readonly countSeries$: Observable<readonly MetricSample[]>;

  constructor(port: SessionsPort) {
    this.countSeries$ = port.sessions$().pipe(
      map((sessions) => {
        return { t: Date.now(), value: sessions.length };
      }),
      scan(
        (acc, sample) => {
          return [...acc, sample].slice(-WINDOW) as readonly MetricSample[];
        },
        [] as readonly MetricSample[],
      ),
      startWith([] as readonly MetricSample[]),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
