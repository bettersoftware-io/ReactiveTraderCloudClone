import type { Dealer } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The credit dealer roster — replay-current, kept warm for the session. */
export interface DealersPresenter {
  readonly list$: Stream<readonly Dealer[]>;
}
