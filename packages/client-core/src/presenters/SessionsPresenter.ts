import { type Observable, shareReplay } from "rxjs";

import type { SessionInfo, SessionsPort } from "@rtc/domain";

/**
 * Thin shareReplay wrapper around SessionsPort.sessions$().
 * One active subscription shared across all UI consumers.
 */
export class SessionsPresenter {
  readonly sessions$: Observable<readonly SessionInfo[]>;

  constructor(port: SessionsPort) {
    this.sessions$ = port
      .sessions$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
