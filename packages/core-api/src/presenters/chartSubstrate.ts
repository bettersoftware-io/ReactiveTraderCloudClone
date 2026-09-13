import type { ChartSubstrate } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The chart-substrate preference: the replay-current substrate stream and the
 * write operation, keeping persistence out of the UI.
 */
export interface ChartSubstratePresenter {
  readonly substrate$: Stream<ChartSubstrate>;
  setSubstrate(substrate: ChartSubstrate): void;
}
