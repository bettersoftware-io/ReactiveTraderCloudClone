import type { Observable } from "rxjs";

import type { SessionInfo, SessionsPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/**
 * Thin warmReplay wrapper around SessionsPort.sessions$().
 * One active subscription shared across all UI consumers, kept warm across the
 * Admin tab's key={activeTab} remount.
 */
export class SessionsPresenter {
  readonly sessions$: Observable<readonly SessionInfo[]>;

  constructor(port: SessionsPort) {
    this.sessions$ = port.sessions$().pipe(warmReplay());
  }
}
