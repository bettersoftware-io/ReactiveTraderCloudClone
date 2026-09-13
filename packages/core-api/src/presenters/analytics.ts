import type { PositionUpdates } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The analytics position stream — replay-current, kept warm for the session. */
export interface AnalyticsPresenter {
  readonly position$: Stream<PositionUpdates>;
}
