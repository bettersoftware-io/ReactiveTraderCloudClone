import { type Observable, shareReplay } from "rxjs";

import type { LayoutEnginePresenter as LayoutEnginePresenterApi } from "@rtc/core-api";
import type { LayoutEngine, PreferencesPort } from "@rtc/domain";

/** Implements `LayoutEnginePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. `engine$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
export class LayoutEnginePresenter implements LayoutEnginePresenterApi {
  readonly engine$: Observable<LayoutEngine>;

  constructor(private readonly preferences: PreferencesPort) {
    this.engine$ = preferences
      .layoutEngine$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setEngine(engine: LayoutEngine): void {
    this.preferences.setLayoutEngine(engine);
  }
}
