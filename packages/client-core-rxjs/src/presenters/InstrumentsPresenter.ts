import type { Observable } from "rxjs";

import type { InstrumentsPresenter as InstrumentsPresenterApi } from "@rtc/core-api";
import {
  type Instrument,
  type InstrumentPort,
  InstrumentsUseCase,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class InstrumentsPresenter implements InstrumentsPresenterApi {
  readonly list$: Observable<readonly Instrument[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(instruments: InstrumentPort, disposed$: Observable<unknown>) {
    this.list$ = new InstrumentsUseCase(instruments)
      .execute()
      .pipe(warmReplay(disposed$));
  }
}
