import { type Observable, shareReplay } from "rxjs";

import type { EqBlotterViewPreferencePresenter as EqBlotterViewPreferencePresenterApi } from "@rtc/core-api";
import type { EqBlotterView, PreferencesPort } from "@rtc/domain";

/** Implements `EqBlotterViewPreferencePresenter` (`@rtc/core-api`) — see
 * the interface for the contract. `view$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class EqBlotterViewPreferencePresenter
  implements EqBlotterViewPreferencePresenterApi
{
  readonly view$: Observable<EqBlotterView>;

  constructor(private readonly preferences: PreferencesPort) {
    this.view$ = preferences
      .eqBlotterView$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setView(view: EqBlotterView): void {
    this.preferences.setEqBlotterView(view);
  }
}
