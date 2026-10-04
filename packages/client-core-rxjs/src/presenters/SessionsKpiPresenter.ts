import type { Observable } from "rxjs";
import { map, scan, startWith } from "rxjs/operators";

import type { SessionsKpiPresenter as SessionsKpiPresenterApi } from "@rtc/core-api";
import { appendMetricSample } from "@rtc/core-logic";
import type { MetricSample, SessionsPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Implements `SessionsKpiPresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Maps each `SessionsPort.sessions$()` emission to a
 * `MetricSample` (timestamped like `BlotterPresenter`'s fill-clock read)
 * and accumulates via the same shape `windowedSamples` gives the other
 * three KPI streams.
 *
 * Held warm with `warmReplay` (`refCount: false`), like `windowedSamples`.
 * This mirrors `EventLogPresenter`'s remount-survival fix (see its
 * doc comment for the fuller writeup) — the KPI row is the sole consumer,
 * and `App.tsx` remounts a tab's whole subtree on switch
 * (`<WorkspaceEngine key={activeTab}>`), which unsubscribes it. With
 * `refCount: true` the `scan` accumulator would tear down on every
 * tab-away and the sparkline would lose its history on tab-back.
 * `refCount: false` keeps the accumulator (and its one subscription into
 * `SessionsPort`) alive for this presenter's lifetime instead, which is
 * safe because `SessionsKpiPresenter` is a composition-root singleton
 * (packages/client-core-rxjs/src/composition.ts), not a per-mount instance — and
 * that lifetime ends at `app.dispose()` (`warmReplay`'s `disposed$`).
 */
export class SessionsKpiPresenter implements SessionsKpiPresenterApi {
  readonly countSeries$: Observable<readonly MetricSample[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(port: SessionsPort, disposed$: Observable<unknown>) {
    this.countSeries$ = port.sessions$().pipe(
      map((sessions) => {
        return { t: Date.now(), value: sessions.length };
      }),
      scan(appendMetricSample, [] as readonly MetricSample[]),
      startWith([] as readonly MetricSample[]),
      warmReplay(disposed$),
    );
  }
}
