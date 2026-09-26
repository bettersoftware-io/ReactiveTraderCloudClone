import type { Observable } from "rxjs";

import type { ErrorRatePresenter as ErrorRatePresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/** Implements `ErrorRatePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Rolls `TelemetryPort.errorRate$()` via
 * `windowedSamples`. */
export class ErrorRatePresenter implements ErrorRatePresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(port: TelemetryPort, disposed$: Observable<unknown>) {
    this.samples$ = windowedSamples(port.errorRate$(), disposed$);
  }
}
