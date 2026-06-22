import { type Observable, shareReplay } from "rxjs";

import { type Dealer, type DealerPort, DealersUseCase } from "@rtc/domain";

export class DealersPresenter {
  readonly list$: Observable<readonly Dealer[]>;
  constructor(dealers: DealerPort) {
    this.list$ = new DealersUseCase(dealers)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
