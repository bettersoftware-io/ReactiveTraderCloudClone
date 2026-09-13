import type { EquityPosition } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The equity position book — replay-current, kept warm for the session. */
export interface PositionsPresenter {
  readonly positions$: Stream<readonly EquityPosition[]>;
}
