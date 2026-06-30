import { type Observable, shareReplay } from "rxjs";

import type { EquityPosition, PositionPort } from "@rtc/domain";

export class PositionsPresenter {
  readonly positions$: Observable<readonly EquityPosition[]>;

  constructor(positionPort: PositionPort) {
    this.positions$ = positionPort
      .positions()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
