import type { Observable } from "rxjs";

import type { DealersPresenter as DealersPresenterApi } from "@rtc/core-api";
import { type Dealer, type DealerPort, DealersUseCase } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class DealersPresenter implements DealersPresenterApi {
  readonly list$: Observable<readonly Dealer[]>;

  constructor(dealers: DealerPort) {
    this.list$ = new DealersUseCase(dealers).execute().pipe(warmReplay());
  }
}
