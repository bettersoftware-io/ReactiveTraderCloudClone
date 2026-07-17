import { createContext } from "solid-js";

import type { MetricTone } from "@rtc/motion-core";

/** Solid counterpart of the react LiveMetricsContext — identical value shape. */
export interface LiveMetrics {
  fps: number | null;
  fpsTone: MetricTone | "dim";
  mem: string | null;
}

/** Freeze seam. Default `null` → live rAF loop (production). A provider value
 *  makes `useLiveMetrics` return it verbatim with no loop (harnesses). */
export const LiveMetricsContext = createContext<LiveMetrics | null>(null);

/** Reproduces the footer's pre-change static appearance so goldens stay stable. */
export const FROZEN_LIVE_METRICS: LiveMetrics = {
  fps: 60,
  fpsTone: "dim",
  mem: "248MB",
};
