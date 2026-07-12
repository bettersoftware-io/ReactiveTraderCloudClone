import type { Observable } from "rxjs";

import { type Dealer, type DealerPort, DealersUseCase } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class DealersPresenter {
  readonly list$: Observable<readonly Dealer[]>;

  constructor(dealers: DealerPort) {
    this.list$ = new DealersUseCase(dealers).execute().pipe(warmReplay());
  }
}
