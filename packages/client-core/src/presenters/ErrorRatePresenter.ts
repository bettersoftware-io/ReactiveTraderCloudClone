import type { Observable } from "rxjs";

import type { ErrorRatePresenter as ErrorRatePresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/**
 * Error-rate chart series — rolls the last WINDOW samples from
 * TelemetryPort.errorRate$() in oldest-first order.
 */
export class ErrorRatePresenter implements ErrorRatePresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.errorRate$());
  }
}
