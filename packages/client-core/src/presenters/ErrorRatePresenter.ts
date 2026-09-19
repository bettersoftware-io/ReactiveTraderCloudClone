import type { Observable } from "rxjs";

import type { ErrorRatePresenter as ErrorRatePresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/** Implements `ErrorRatePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Rolls `TelemetryPort.errorRate$()` via
 * `windowedSamples`. */
export class ErrorRatePresenter implements ErrorRatePresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.errorRate$());
  }
}
