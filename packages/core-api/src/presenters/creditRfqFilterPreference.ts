import type { CreditRfqFilter } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The Credit RFQs panel's LIVE/CLOSED/ALL filter: the replay-current filter
 * stream and the write operation, keeping persistence out of the UI.
 */
export interface CreditRfqFilterPreferencePresenter {
  readonly filter$: Stream<CreditRfqFilter>;
  setFilter(filter: CreditRfqFilter): void;
}
