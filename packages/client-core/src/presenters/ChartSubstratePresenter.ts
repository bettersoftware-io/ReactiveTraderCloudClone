import { type Observable, shareReplay } from "rxjs";

import type { ChartSubstrate, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the chart-substrate preference. Exposes the
 * replay-current substrate stream and the write operation, keeping
 * persistence out of the UI.
 */
export class ChartSubstratePresenter {
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
