import { type Observable, shareReplay } from "rxjs";

import type { AmbientStyle, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the ambient-style preference. Exposes the
 * replay-current style stream and the write operation, keeping persistence out
 * of the UI. Orthogonal to AnimatedBackgroundPresenter (the motion gate).
 */
export class AmbientStylePresenter {
  readonly style$: Observable<AmbientStyle>;

  constructor(private readonly preferences: PreferencesPort) {
    this.style$ = preferences
      .ambientStyle$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setStyle(style: AmbientStyle): void {
    this.preferences.setAmbientStyle(style);
  }
}
