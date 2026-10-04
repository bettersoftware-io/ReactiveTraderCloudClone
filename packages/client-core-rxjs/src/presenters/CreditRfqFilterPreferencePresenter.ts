import { type Observable, shareReplay } from "rxjs";

import type { CreditRfqFilterPreferencePresenter as CreditRfqFilterPreferencePresenterApi } from "@rtc/core-api";
import type { CreditRfqFilter, PreferencesPort } from "@rtc/domain";

/** Implements `CreditRfqFilterPreferencePresenter` (`@rtc/core-api`) — see
 * the interface for the contract. Mirrors `ViewModePreferencePresenter`
 * exactly — the RFQs panel reads `filter$`, and its head's filter pills
 * write through `setFilter`. */
export class CreditRfqFilterPreferencePresenter
  implements CreditRfqFilterPreferencePresenterApi
{
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
