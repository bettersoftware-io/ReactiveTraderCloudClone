import { map, type Observable, shareReplay } from "rxjs";

import type { PowerSaverPresenter as PowerSaverPresenterApi } from "@rtc/core-api";
import type { PowerSaverLevel, PreferencesPort } from "@rtc/domain";

/** Implements `PowerSaverPresenter` (`@rtc/core-api`) — see the interface
 * for the contract. `isCalm$`/`isFreeze$` are `level$` mapped, each
 * independently under `shareReplay({ bufferSize: 1, refCount: true })`. */
export class PowerSaverPresenter implements PowerSaverPresenterApi {
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
