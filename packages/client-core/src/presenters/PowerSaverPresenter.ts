import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the power-saver master override. Exposes the
 * replay-current enabled flag and the write/toggle operations. While enabled
 * the client forces the cheap rendering path everywhere; it never mutates
 * other preferences (master-override semantics).
 */
export class PowerSaverPresenter {
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .powerSaver$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setPowerSaver(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
