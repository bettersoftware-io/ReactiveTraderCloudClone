import { type Observable, shareReplay } from "rxjs";

import type { EqBlotterView, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the equities blotter tab preference (Orders /
 * Positions). Exposes the replay-current view stream and the write
 * operation, keeping persistence out of the UI. Consumed by the Blotter
 * panel (Task 5); this task only plumbs the seam through.
 */
export class EqBlotterViewPreferencePresenter {
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
