import type { Observable } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import { appendMetricSample } from "@rtc/core-logic";
import { METRIC_WINDOW, type MetricSample } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Rolling window size — number of MetricSamples retained per chart series.
 * Kept for existing importers: re-exports the domain constant. */
export const WINDOW: number = METRIC_WINDOW;

export function windowedSamples(
  source$: Observable<MetricSample>,
): Observable<readonly MetricSample[]> {
  return source$.pipe(
    scan(appendMetricSample, [] as readonly MetricSample[]),
    startWith([] as readonly MetricSample[]),
    // Warm across the Admin tab's key={activeTab} remount so the rolling chart
    // window survives a tab switch instead of resetting to the seed. Matches
    // EventLogPresenter / SessionsKpiPresenter, which already keep warm.
    warmReplay(),
  );
}
