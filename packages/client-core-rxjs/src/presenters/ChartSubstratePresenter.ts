import { type Observable, shareReplay } from "rxjs";

import type { ChartSubstratePresenter as ChartSubstratePresenterApi } from "@rtc/core-api";
import type { ChartSubstrate, PreferencesPort } from "@rtc/domain";

/** Implements `ChartSubstratePresenter` (`@rtc/core-api`) — see the
 * interface for the contract. `substrate$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class ChartSubstratePresenter implements ChartSubstratePresenterApi {
  readonly substrate$: Observable<ChartSubstrate>;

  constructor(private readonly preferences: PreferencesPort) {
    this.substrate$ = preferences
      .chartSubstrate$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setSubstrate(substrate: ChartSubstrate): void {
    this.preferences.setChartSubstrate(substrate);
  }
}
