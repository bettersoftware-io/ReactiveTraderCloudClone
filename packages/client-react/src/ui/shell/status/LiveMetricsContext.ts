import { createContext } from "react";

import type { MetricTone } from "@rtc/motion-core";

/** The live HUD readouts consumed by CosmeticMetrics. `fps`/`mem` are null until
 *  the first sample (or where `performance.memory` is unavailable); `fpsTone`
 *  carries the traffic-light tone, falling back to "dim" (the default cell
 *  colour) when there is no reading yet. */
export interface LiveMetrics {
  fps: number | null;
  fpsTone: MetricTone | "dim";
  mem: string | null;
}

/** Freeze seam. Default `null` → `useLiveMetrics` runs the live rAF loop
 *  (production). When a provider supplies a value, the hook returns it verbatim
 *  and starts no loop — used by the visual + contract harnesses for
 *  determinism. Mirrors ThemeContext's split-context pattern. */
export const LiveMetricsContext = createContext<LiveMetrics | null>(null);

/** The seed the harnesses inject: reproduces the footer's pre-change static
 *  appearance exactly (FPS "60" in its original `dim` tone, MEM "248MB"), so
 *  every committed golden stays byte-identical. The live traffic-light is
 *  verified in-browser, not in goldens. */
export const FROZEN_LIVE_METRICS: LiveMetrics = {
  fps: 60,
  fpsTone: "dim",
  mem: "248MB",
};
