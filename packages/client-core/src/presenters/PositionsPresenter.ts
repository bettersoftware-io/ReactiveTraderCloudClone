import type { Observable } from "rxjs";

import type { EquityPosition, PositionPort } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class PositionsPresenter {
  readonly positions$: Observable<readonly EquityPosition[]>;

  constructor(positionPort: PositionPort) {
    this.positions$ = positionPort.positions().pipe(warmReplay());
  }
}
