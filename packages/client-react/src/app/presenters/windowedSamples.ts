import { type Observable, shareReplay } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { MetricSample } from "@rtc/domain";

/** Rolling window size — number of MetricSamples retained per chart series. */
export const WINDOW = 60;

export function windowedSamples(
  source$: Observable<MetricSample>,
): Observable<readonly MetricSample[]> {
  return source$.pipe(
    scan(
      (acc, s) => {
        return [...acc, s].slice(-WINDOW) as readonly MetricSample[];
      },
      [] as readonly MetricSample[],
    ),
    startWith([] as readonly MetricSample[]),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
