import type { Observable } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { MetricSample } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

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
    // Warm across the Admin tab's key={activeTab} remount so the rolling chart
    // window survives a tab switch instead of resetting to the seed. Matches
    // EventLogPresenter / SessionsKpiPresenter, which already keep warm.
    warmReplay(),
  );
}
