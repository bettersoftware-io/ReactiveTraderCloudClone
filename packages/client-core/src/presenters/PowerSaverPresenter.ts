import { map, type Observable, shareReplay } from "rxjs";

import type { PowerSaverLevel, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the power-saver master override. Exposes the
 * replay-current level plus derived predicates: `isCalm$` (level !== "off",
 * drives ambient removal / --fx-play / price conflation) and `isFreeze$`
 * (level === "freeze", drives the view layer's motion catch-all + JS gates).
 * Never mutates other preferences (master-override semantics).
 */
export class PowerSaverPresenter {
  readonly level$: Observable<PowerSaverLevel>;

  readonly isCalm$: Observable<boolean>;

  readonly isFreeze$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.level$ = preferences
      .powerSaverLevel$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.isCalm$ = this.level$.pipe(
      map((level) => {
        return level !== "off";
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.isFreeze$ = this.level$.pipe(
      map((level) => {
        return level === "freeze";
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  setLevel(level: PowerSaverLevel): void {
    this.preferences.setPowerSaverLevel(level);
  }
}
