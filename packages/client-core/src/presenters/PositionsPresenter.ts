import type { Observable } from "rxjs";

import type { PositionsPresenter as PositionsPresenterApi } from "@rtc/core-api";
import type { EquityPosition, PositionPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class PositionsPresenter implements PositionsPresenterApi {
  readonly positions$: Observable<readonly EquityPosition[]>;

  constructor(positionPort: PositionPort) {
    this.positions$ = positionPort.positions().pipe(warmReplay());
  }
}
