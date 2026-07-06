import { type Observable, shareReplay } from "rxjs";

import type { CreditRfqFilter, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the Credit RFQs panel's LIVE/CLOSED/ALL filter.
 * Exposes the replay-current filter stream and the write operation, keeping
 * persistence out of the UI. Mirrors ViewModePreferencePresenter exactly —
 * the RFQs panel reads filter$, and its head's filter pills (Task 4) write
 * through setFilter.
 */
export class CreditRfqFilterPreferencePresenter {
  readonly filter$: Observable<CreditRfqFilter>;

  constructor(private readonly preferences: PreferencesPort) {
    this.filter$ = preferences
      .creditRfqFilter$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setFilter(filter: CreditRfqFilter): void {
    this.preferences.setCreditRfqFilter(filter);
  }
}
