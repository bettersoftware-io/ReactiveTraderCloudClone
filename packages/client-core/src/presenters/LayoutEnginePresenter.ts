import { type Observable, shareReplay } from "rxjs";

import type { LayoutEngine, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the layout-engine preference. Exposes the
 * replay-current engine stream and the write operation, keeping
 * persistence out of the UI.
 */
export class LayoutEnginePresenter {
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
