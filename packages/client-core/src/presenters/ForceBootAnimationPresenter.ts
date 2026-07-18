import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the force-boot-animation preference. Exposes the
 * replay-current enabled flag and the write/toggle operations. When on, the
 * boot splash plays even under prefers-reduced-motion.
 */
export class ForceBootAnimationPresenter {
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .forceBootAnimation$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setForceBootAnimation(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
