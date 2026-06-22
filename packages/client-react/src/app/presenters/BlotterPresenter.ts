import { type Observable, shareReplay } from "rxjs";

import { type BlotterPort, type Trade, TradeBlotterUseCase } from "@rtc/domain";

export class BlotterPresenter {
  readonly trades$: Observable<readonly Trade[]>;
  constructor(blotter: BlotterPort) {
    this.trades$ = new TradeBlotterUseCase(blotter)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
