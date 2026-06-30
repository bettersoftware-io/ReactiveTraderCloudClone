import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the ambient-motion perf gate. Exposes the
 * replay-current enabled flag and the write/toggle operations.
 */
export class AnimatedBackgroundPresenter {
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .animatedBackground$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setAnimatedBackground(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
