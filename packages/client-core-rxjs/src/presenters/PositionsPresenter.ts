import type { Observable } from "rxjs";

import type { PositionsPresenter as PositionsPresenterApi } from "@rtc/core-api";
import type { EquityPosition, PositionPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class PositionsPresenter implements PositionsPresenterApi {
  readonly positions$: Observable<readonly EquityPosition[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(positionPort: PositionPort, disposed$: Observable<unknown>) {
    this.positions$ = positionPort.positions().pipe(warmReplay(disposed$));
  }
}
