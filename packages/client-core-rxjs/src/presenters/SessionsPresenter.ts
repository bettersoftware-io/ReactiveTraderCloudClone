import type { Observable } from "rxjs";

import type { SessionsPresenter as SessionsPresenterApi } from "@rtc/core-api";
import type { SessionInfo, SessionsPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Implements `SessionsPresenter` (`@rtc/core-api`) — see the interface for
 * the contract. A thin `warmReplay` wrapper around
 * `SessionsPort.sessions$()`, kept warm across the Admin tab's
 * `key={activeTab}` remount. */
export class SessionsPresenter implements SessionsPresenterApi {
  readonly sessions$: Observable<readonly SessionInfo[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(port: SessionsPort, disposed$: Observable<unknown>) {
    this.sessions$ = port.sessions$().pipe(warmReplay(disposed$));
  }
}
